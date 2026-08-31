import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidUuid } from "../inputValidation.js";
import { salePublicView } from "./posNativeCheckout.js";
import { buildInvoiceFromPosSale } from "./posSaleInvoiceMath.js";

export { buildInvoiceFromPosSale };

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function saleSnapshot(row) {
  return row?.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
    ? { ...row.raw_payload }
    : {};
}

function mapConvertSchemaError(message) {
  const msg = String(message || "");
  if (
    /pos_sale_event_id|invoices\.invoice_id|column .*invoice_id/i.test(msg)
    && /schema cache|does not exist|could not find the/i.test(msg)
  ) {
    return "POS invoice convert needs a database update. Run supabase/migrations/20260828200000_pos_sale_invoice.sql in the Supabase SQL Editor.";
  }
  return msg || "Could not convert sale to invoice";
}

async function loadExistingInvoice(orgId, saleId, invoiceId) {
  if (invoiceId && isValidUuid(invoiceId)) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, status, pos_sale_event_id, client_id, total_amount, currency")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!error && data?.id) return data;
  }
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, status, pos_sale_event_id, client_id, total_amount, currency")
    .eq("org_id", orgId)
    .eq("pos_sale_event_id", saleId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function linkSaleInvoice(saleId, invoiceId) {
  const { data, error } = await supabaseAdmin
    .from("pos_sales_events")
    .update({ invoice_id: invoiceId })
    .eq("id", saleId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * POST /api/pos/invoice
 * Optional tax-invoice copy of a completed till sale. Never auto-runs from checkout.
 */
export async function handlePosConvertToInvoice(req, res, gate) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const saleId = String(body.sale_id || "").trim();
  const requestedClientId = String(body.client_id || "").trim();

  if (!isValidUuid(saleId)) {
    return jsonError(res, 422, "sale_id is required", { code: "SALE_REQUIRED" });
  }
  if (requestedClientId && !isValidUuid(requestedClientId)) {
    return jsonError(res, 422, "client_id is invalid", { code: "CLIENT_INVALID" });
  }

  const orgId = gate.membership.orgId;

  const { data: sale, error: saleError } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("id", saleId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (saleError) return jsonError(res, 500, saleError.message || "Could not load sale");
  if (!sale) return jsonError(res, 404, "Sale not found");

  try {
    const existing = await loadExistingInvoice(orgId, sale.id, sale.invoice_id);
    if (existing?.id) {
      let linked = sale;
      if (sale.invoice_id !== existing.id) {
        linked = await linkSaleInvoice(sale.id, existing.id);
      }
      return res.status(200).json({
        already_converted: true,
        invoice: existing,
        sale: salePublicView(linked),
      });
    }
  } catch (err) {
    return jsonError(res, 500, mapConvertSchemaError(err?.message));
  }

  let working = sale;
  const clientId = sale.client_id || requestedClientId;
  if (!sale.client_id) {
    if (!clientId) {
      return jsonError(res, 422, "Attach a named customer before converting to an invoice", {
        code: "CLIENT_REQUIRED",
      });
    }
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, name, email")
      .eq("id", clientId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (clientError) return jsonError(res, 500, clientError.message || "Could not load customer");
    if (!client) return jsonError(res, 422, "Customer not found", { code: "CLIENT_NOT_FOUND" });

    const snap = saleSnapshot(sale);
    snap.customer_name = client.name || snap.customer_name || null;
    snap.customer_email = client.email || snap.customer_email || null;
    const { data: attached, error: attachError } = await supabaseAdmin
      .from("pos_sales_events")
      .update({ client_id: client.id, raw_payload: snap })
      .eq("id", sale.id)
      .eq("org_id", orgId)
      .select("*")
      .single();
    if (attachError) return jsonError(res, 500, mapConvertSchemaError(attachError.message));
    working = attached;
  }

  const built = buildInvoiceFromPosSale(working, {
    orgId,
    clientId: working.client_id,
    createdBy: gate.user.id,
    companyId: working.company_id,
  });
  if (!built.ok) {
    return jsonError(res, 422, built.error, { code: built.code });
  }

  const invoiceRow = { ...built.invoice };
  if (!invoiceRow.company_id) delete invoiceRow.company_id;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("invoices")
    .insert(invoiceRow)
    .select("id, invoice_number, status, pos_sale_event_id, client_id, total_amount, currency")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      try {
        const raced = await loadExistingInvoice(orgId, working.id, null);
        if (raced?.id) {
          const linked = await linkSaleInvoice(working.id, raced.id);
          return res.status(200).json({
            already_converted: true,
            invoice: raced,
            sale: salePublicView(linked),
          });
        }
      } catch (err) {
        return jsonError(res, 500, mapConvertSchemaError(err?.message));
      }
    }
    return jsonError(res, 500, mapConvertSchemaError(insertError.message));
  }

  const itemRows = built.items.map((item) => ({
    invoice_id: inserted.id,
    ...(item.service_id ? { service_id: item.service_id } : {}),
    service_name: item.service_name,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total_price: item.total_price,
  }));

  const { error: itemsError } = await supabaseAdmin.from("invoice_items").insert(itemRows);
  if (itemsError) {
    await supabaseAdmin.from("invoices").delete().eq("id", inserted.id);
    return jsonError(res, 500, mapConvertSchemaError(itemsError.message));
  }

  try {
    const linked = await linkSaleInvoice(working.id, inserted.id);
    return res.status(201).json({
      already_converted: false,
      invoice: inserted,
      sale: salePublicView(linked),
    });
  } catch (err) {
    return jsonError(res, 500, mapConvertSchemaError(err?.message), { invoice: inserted });
  }
}
