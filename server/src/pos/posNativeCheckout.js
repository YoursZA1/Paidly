import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { commitNativePosInventory } from "./posInventorySync.js";
import { resolveCheckoutRegister } from "./posRegisters.js";
import { resolveOpenSession } from "./posRegisterSessions.js";
import { PERMISSIONS, forbidUnlessPermission } from "../companyRouteAccess.js";
import {
  buildCheckoutLines,
  makeReceiptNumber,
  normalizePaymentMethod,
  roundMoney,
  applyPosSaleDiscount,
  quotedCheckoutMoneyConflict,
  paymentIntentMatchesPayable,
  posSaleCompletesWhenPaid,
  clientBelongsToCheckoutOrg,
} from "./posCheckoutMath.js";
import {
  allocateReturnLines,
  paymentMethodForRefundRail,
  refundRailForSale,
  summarizeSaleRefunds,
  withSaleLineIds,
} from "./posReturnMath.js";
import { mapPosPaymentMethodToProvider, isTillCashSettlement, isCardTerminalSettlement, publicPaymentIntentView } from "../payments/paymentIntentContract.js";
import {
  attachPosSaleToIntent,
  confirmPaymentIntent,
  createPaymentIntentRow,
  mapPaymentIntentSchemaError,
  settleTillCashIntent,
} from "../payments/paymentIntentService.js";
import {
  filterCatalogForRegister,
  saleCompanyIdFromRegister,
} from "./posCatalogScope.js";
import { recordPosAuditEvent, recordPosAuditEvents } from "./posAudit.js";
import {
  POS_AUDIT_ACTOR,
  posAuditCancellation,
  posAuditInventoryAndCompletion,
  posAuditRefund,
  posAuditSaleCreatedAndPayment,
} from "./posAuditMath.js";
import { isValidUuid } from "../inputValidation.js";

const CATALOG_SELECT =
  "id, org_id, name, sku, barcode, item_type, is_active, price, default_rate, unit_price, rate, stock_quantity, image_url, category, company_id";
const CATALOG_SELECT_LEGACY =
  "id, org_id, name, sku, barcode, item_type, is_active, price, default_rate, unit_price, rate, stock_quantity, image_url, category";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

async function ensureNativePosConnection(orgId, userId) {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("pos_connections")
    .select("id, org_id, provider, status")
    .eq("org_id", orgId)
    .eq("provider", "paidly")
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing?.id) {
    if (existing.status !== "active") {
      await supabaseAdmin
        .from("pos_connections")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("pos_connections")
    .insert({
      org_id: orgId,
      provider: "paidly",
      label: "Paidly POS",
      status: "active",
      created_by: userId || null,
      config: { connection_method: "native" },
    })
    .select("id, org_id, provider, status")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("pos_connections")
        .select("id, org_id, provider, status")
        .eq("org_id", orgId)
        .eq("provider", "paidly")
        .maybeSingle();
      if (raced?.id) return raced;
    }
    throw insertError;
  }
  return inserted;
}

function queryRegisterId(req) {
  const raw = req.query?.register_id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value).trim() : "";
}

function applyCatalogBrandFilter(query, registerCompanyId) {
  if (registerCompanyId && isValidUuid(registerCompanyId)) {
    return query.or(`company_id.is.null,company_id.eq.${registerCompanyId}`);
  }
  return query.is("company_id", null);
}

async function loadPosCatalogRows(orgId, opts = {}) {
  const { productIds, activeOnly = false, registerCompanyId = null, enforceBrand = false } = opts;
  const ids = Array.isArray(productIds) ? [...new Set(productIds.filter(Boolean))] : null;
  if (ids && ids.length === 0) return [];

  async function run(select, applyBrand) {
    let query = supabaseAdmin
      .from("services")
      .select(select)
      .eq("org_id", orgId)
      .eq("item_type", "product");
    if (activeOnly) query = query.eq("is_active", true);
    if (ids) query = query.in("id", ids);
    if (applyBrand) query = applyCatalogBrandFilter(query, registerCompanyId);
    if (!ids) query = query.order("name", { ascending: true }).limit(500);
    return query;
  }

  let { data, error } = await run(CATALOG_SELECT, enforceBrand);
  if (error && /company_id/i.test(error.message || "")) {
    const retry = await run(CATALOG_SELECT_LEGACY, false);
    data = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  const rows = data || [];
  if (!enforceBrand) return rows;
  return filterCatalogForRegister(rows, registerCompanyId);
}

async function loadCatalogMap(orgId, productIds, opts = {}) {
  const rows = await loadPosCatalogRows(orgId, { productIds, ...opts });
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadBrandSnapshot(orgId, companyId) {
  if (!companyId || !isValidUuid(companyId)) return { name: null, logo_url: null };
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, name, logo_url")
    .eq("id", companyId)
    .eq("org_id", orgId)
    .maybeSingle();
  return { name: data?.name || null, logo_url: data?.logo_url || null };
}

function mapMissingSchema(message) {
  const msg = String(message || "");
  if (/pos_connections|pos_sales_events|sale_kind|receipt_number|payment_intents|payment_intent_id|pos_registers|register_id|pos_register_sessions|session_id|refund_status|refund_rail|refunded_amount|original_payment_intent_id|refund_of_intent_id|services\.company_id|pos_audit_events/i.test(msg)
    && /schema cache|does not exist|violates check constraint|invalid input value|could not find the/i.test(msg)) {
    return "Native POS tables need a database update. Run supabase/migrations/20260828160000_native_pos_checkout.sql, supabase/migrations/20260828180000_payment_intents.sql, supabase/migrations/20260828190000_payment_intents_card_terminal.sql, supabase/migrations/20260828210000_pos_registers.sql, supabase/migrations/20260828220000_pos_register_sessions.sql, supabase/migrations/20260828230000_pos_return_audit.sql, supabase/migrations/20260828240000_pos_multibrand_catalog.sql, and supabase/migrations/20260828250000_pos_audit_trail.sql in the Supabase SQL Editor.";
  }
  return mapPaymentIntentSchemaError(msg);
}

function salePublicView(row) {
  if (!row) return null;
  const snap = row.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
    ? row.raw_payload
    : {};
  return {
    id: row.id,
    receipt_number: row.receipt_number || row.external_id,
    provider: row.provider,
    status: row.status,
    sale_kind: row.sale_kind || "sale",
    total_amount: Number(row.total_amount) || 0,
    currency: row.currency || "ZAR",
    payment_method: row.payment_method,
    occurred_at: row.occurred_at,
    items: Array.isArray(row.items) ? row.items : [],
    client_id: row.client_id || null,
    company_id: row.company_id || null,
    cashier_id: row.cashier_id || null,
    parent_event_id: row.parent_event_id || null,
    payment_intent_id: row.payment_intent_id || null,
    original_payment_intent_id: row.original_payment_intent_id || snap.original_payment_intent_id || null,
    refund_status: row.refund_status || (row.sale_kind === "return" ? null : "none"),
    refunded_amount: row.refunded_amount != null ? Number(row.refunded_amount) : 0,
    refund_rail: row.refund_rail || snap.refund_rail || null,
    invoice_id: row.invoice_id || null,
    register_id: row.register_id || null,
    session_id: row.session_id || null,
    amount_tendered: row.amount_tendered != null ? Number(row.amount_tendered) : null,
    change_due: row.change_due != null ? Number(row.change_due) : null,
    inventory_applied: !!row.inventory_applied,
    inventory_result: row.inventory_result || null,
    subtotal: snap.subtotal != null ? Number(snap.subtotal) : null,
    discount_amount: snap.discount_amount != null ? Number(snap.discount_amount) : 0,
    tax_amount: snap.tax_amount != null ? Number(snap.tax_amount) : 0,
    tax_rate: snap.tax_rate != null ? Number(snap.tax_rate) : 0,
    brand_name: snap.brand_name || null,
    brand_logo_url: snap.brand_logo_url || null,
    cashier_name: snap.cashier_name || null,
    customer_name: snap.customer_name || null,
    customer_email: snap.customer_email || null,
    raw_payload: snap,
  };
}

export { salePublicView };

async function persistSaleInventory(saleEventId, inventory, extra = {}) {
  const { data, error } = await supabaseAdmin
    .from("pos_sales_events")
    .update({
      inventory_applied: !!inventory.applied && !inventory.failed,
      inventory_result: inventory.results,
      ...extra,
    })
    .eq("id", saleEventId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function snapshotOriginalRefundState(original) {
  if (!original?.id) return original;
  const { data: prior, error } = await supabaseAdmin
    .from("pos_sales_events")
    .select("id, items, total_amount, status, sale_kind")
    .eq("parent_event_id", original.id)
    .eq("sale_kind", "return");
  if (error) return original;
  const summary = summarizeSaleRefunds(original, prior || []);
  const { data, error: updateError } = await supabaseAdmin
    .from("pos_sales_events")
    .update({
      refund_status: summary.refund_status,
      refunded_amount: summary.refunded_amount,
    })
    .eq("id", original.id)
    .select("*")
    .single();
  if (updateError) return original;
  return data || original;
}

/**
 * Stock moves only after a pos_sales_events row exists (post-settlement).
 * Retries a sale that was recorded but not yet decremented.
 */
async function settleRecordedSaleInventory(res, {
  orgId,
  sale,
  items,
  direction,
  intent,
  duplicate = false,
  originalSale = null,
  actorId = null,
}) {
  try {
    const inventory = await commitNativePosInventory(supabaseAdmin, {
      orgId,
      saleEventId: sale.id,
      items,
      direction,
      paymentSettled: true,
    });

    await recordPosAuditEvents(
      posAuditInventoryAndCompletion({
        orgId,
        saleId: sale.id,
        actorId,
        actorType: POS_AUDIT_ACTOR.USER,
        direction,
        applied: inventory.applied,
        failed: Boolean(inventory.failed),
        skip: Boolean(inventory.duplicate),
      })
    );

    if (inventory.failed) {
      const failedSale = await persistSaleInventory(sale.id, inventory, { status: "failed" });
      return jsonError(res, 409, inventory.failed.reason || "Could not update inventory", {
        code: "INVENTORY_FAILED",
        sale_id: sale.id,
        sale: salePublicView(failedSale),
        inventory_result: inventory.results,
      });
    }

    const updated = inventory.duplicate
      ? sale
      : await persistSaleInventory(sale.id, inventory, { status: "completed" });

    if (intent?.id && updated?.id) {
      try {
        intent = await attachPosSaleToIntent(intent.id, updated.id);
      } catch {
        /* sale is recorded; intent link is best-effort */
      }
    }

    let original = originalSale;
    if (original?.id && (updated?.sale_kind || sale.sale_kind) === "return") {
      original = await snapshotOriginalRefundState(original);
    }

    return res.status(duplicate || inventory.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: duplicate || !!inventory.duplicate,
      sale: salePublicView(updated),
      original: original ? salePublicView(original) : undefined,
      payment_intent: intent ? publicPaymentIntentView(intent) : undefined,
      inventory_result: inventory.results,
    });
  } catch (err) {
    return jsonError(res, 500, mapMissingSchema(err?.message), { code: err?.code, sale_id: sale?.id });
  }
}

/**
 * GET /api/pos/catalog — physical products for the till, scoped to the register brand.
 * Shared (company_id null) + matching register.company_id. Header brand is ignored.
 */
export async function handleNativePosCatalog(req, res, gate) {
  const registerId = queryRegisterId(req);
  let register = null;
  try {
    const resolved = await resolveCheckoutRegister(
      gate.membership.orgId,
      gate.user.id,
      registerId || null
    );
    if (registerId && !resolved.ok) {
      return jsonError(res, 422, resolved.error, { code: resolved.code });
    }
    if (resolved.ok) register = resolved.register;
  } catch (err) {
    const mapped = mapMissingSchema(err?.message);
    if (!/database update|pos_registers/i.test(mapped)) {
      return jsonError(res, 500, mapped);
    }
  }

  const registerCompanyId = saleCompanyIdFromRegister(register);
  try {
    const products = await loadPosCatalogRows(gate.membership.orgId, {
      activeOnly: true,
      registerCompanyId,
      enforceBrand: true,
    });
    return res.status(200).json({
      products,
      register_id: register?.id || null,
      company_id: registerCompanyId,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load catalog");
  }
}

/**
 * POST /api/pos/checkout
 */
export async function handleNativePosCheckout(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_SELL)) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const paymentMethod = normalizePaymentMethod(body.payment_method);
  if (!paymentMethod) {
    return jsonError(res, 422, "payment_method must be cash, card, digital, or other");
  }
  if (body.manual_complete || body.force_paid || body.mark_paid) {
    return jsonError(res, 403, "Manual card/digital complete is not enabled. Wait for the payment rail to confirm.", {
      code: "MANUAL_CARD_FORBIDDEN",
    });
  }

  const currency = String(body.currency || "ZAR").trim().toUpperCase().slice(0, 3) || "ZAR";
  const idempotencyKey = String(body.idempotency_key || "").trim() || crypto.randomUUID();
  const clientId = body.client_id ? String(body.client_id).trim() : null;
  const registerIdFromBody = body.register_id ? String(body.register_id).trim() : null;

  let connection;
  try {
    connection = await ensureNativePosConnection(gate.membership.orgId, gate.user.id);
  } catch (err) {
    return jsonError(res, 500, mapMissingSchema(err?.message));
  }

  let register = null;
  try {
    const resolved = await resolveCheckoutRegister(gate.membership.orgId, gate.user.id, registerIdFromBody);
    if (!resolved.ok) {
      return jsonError(res, 422, resolved.error, { code: resolved.code });
    }
    register = resolved.register;
  } catch (err) {
    const mapped = mapMissingSchema(err?.message);
    if (/database update|pos_registers/i.test(mapped) && !registerIdFromBody) {
      register = null;
    } else {
      return jsonError(res, 500, mapped);
    }
  }

  const companyId = saleCompanyIdFromRegister(register);

  const { data: existing } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("external_id", idempotencyKey)
    .maybeSingle();

  if (existing?.id) {
    return settleRecordedSaleInventory(res, {
      orgId: gate.membership.orgId,
      sale: existing,
      items: Array.isArray(existing.items) ? existing.items : [],
      direction: "out",
      duplicate: true,
      actorId: gate.user.id,
    });
  }

  let session = null;
  if (register?.id) {
    try {
      const resolvedSession = await resolveOpenSession(gate.membership.orgId, register.id);
      if (resolvedSession.missingSchema) {
        session = null;
      } else if (!resolvedSession.ok) {
        return jsonError(res, 422, resolvedSession.error, { code: resolvedSession.code });
      } else {
        session = resolvedSession.session;
      }
    } catch (err) {
      const mapped = mapMissingSchema(err?.message);
      if (/database update|pos_register_sessions|session_id/i.test(mapped)) {
        session = null;
      } else {
        return jsonError(res, 500, mapped);
      }
    }
  }

  const productIds = (Array.isArray(body.items) ? body.items : []).map((row) => row?.product_id);
  let catalogById;
  try {
    catalogById = await loadCatalogMap(gate.membership.orgId, productIds, {
      registerCompanyId: companyId,
      enforceBrand: true,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load products");
  }

  const built = buildCheckoutLines(body.items, catalogById, {
    requireStock: true,
    allowPriceOverride: false,
  });
  if (!built.ok) {
    return jsonError(res, 422, built.error, built.code ? { code: built.code, product_id: built.product_id } : {});
  }

  const payable = applyPosSaleDiscount(built.subtotal, body.discount_amount);
  if (payable.discount_amount > 0 && forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_DISCOUNT)) {
    return;
  }
  const quoted = quotedCheckoutMoneyConflict(body, payable);
  if (!quoted.ok) {
    return jsonError(res, 422, quoted.error, { code: quoted.code });
  }

  if (clientId) {
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("id, org_id")
      .eq("id", clientId)
      .eq("org_id", gate.membership.orgId)
      .maybeSingle();
    if (clientError || !clientBelongsToCheckoutOrg(client, gate.membership.orgId)) {
      return jsonError(res, 422, "Customer is not in this organization");
    }
  }

  const rail = mapPosPaymentMethodToProvider(paymentMethod);
  if (!rail) {
    return jsonError(res, 422, "Unsupported POS payment method");
  }

  let intent;
  try {
    intent = await createPaymentIntentRow({
      orgId: gate.membership.orgId,
      sourceKind: "pos",
      provider: rail,
      amount: payable.total,
      currency,
      idempotencyKey,
      clientId,
      companyId,
      createdBy: gate.user.id,
      metadata: {
        origin: "pos",
        settlement: isTillCashSettlement(rail) ? "till" : isCardTerminalSettlement(rail) ? "terminal" : "online",
        payment_method: paymentMethod,
        subtotal: payable.subtotal,
        discount_amount: payable.discount_amount,
        tax_amount: payable.tax_amount,
      },
    });
  } catch (err) {
    return jsonError(res, 500, mapMissingSchema(err?.message), { code: err?.code });
  }

  const intentMatch = paymentIntentMatchesPayable(intent, payable, {
    orgId: gate.membership.orgId,
    currency,
  });
  if (!intentMatch.ok) {
    return jsonError(res, 422, intentMatch.error, { code: intentMatch.code });
  }

  if (intent.status === "paid" && intent.pos_sale_event_id) {
    const { data: paidSale } = await supabaseAdmin
      .from("pos_sales_events")
      .select("*")
      .eq("id", intent.pos_sale_event_id)
      .eq("org_id", gate.membership.orgId)
      .maybeSingle();
    if (paidSale?.id) {
      return settleRecordedSaleInventory(res, {
        orgId: gate.membership.orgId,
        sale: paidSale,
        items: Array.isArray(paidSale.items) ? paidSale.items : built.lines,
        direction: "out",
        intent,
        duplicate: true,
        actorId: gate.user.id,
      });
    }
  }

  let charge = { status: intent.status };
  if (intent.status === "paid") {
    const meta = intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
    charge = {
      status: "paid",
      amount_tendered: meta.amount_tendered ?? null,
      change_due: meta.change_due ?? null,
    };
  } else {
    try {
      const confirmed = isTillCashSettlement(rail)
        ? await settleTillCashIntent(intent, body.amount_tendered)
        : await confirmPaymentIntent(intent, {
            paymentMethod,
            amountTendered: body.amount_tendered,
          });
      intent = confirmed.intent;
      charge = confirmed.charge;
    } catch (err) {
      return jsonError(res, 500, mapMissingSchema(err?.message), { code: err?.code });
    }
  }

  if (!posSaleCompletesWhenPaid(intent)) {
    await recordPosAuditEvent(
      posAuditCancellation({
        orgId: gate.membership.orgId,
        intentId: intent.id,
        actorId: gate.user.id,
        reason: charge.code || intent.metadata?.code || "PAYMENT_NOT_VERIFIED",
        intentStatus: intent.status,
        paymentMethod,
      })
    );
    return jsonError(res, 422, charge.error || "Payment was not verified", {
      code: charge.code || intent.metadata?.code || "PAYMENT_NOT_VERIFIED",
      payment_intent: publicPaymentIntentView(intent),
    });
  }

  if (isCardTerminalSettlement(rail)) {
    const meta = intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
    if (!meta.terminal_confirmed) {
      await recordPosAuditEvent(
        posAuditCancellation({
          orgId: gate.membership.orgId,
          intentId: intent.id,
          actorId: gate.user.id,
          reason: "MANUAL_CARD_FORBIDDEN",
          intentStatus: intent.status,
          paymentMethod,
        })
      );
      return jsonError(
        res,
        403,
        "Card cannot be marked paid from a till click. A connected terminal or webhook confirmation is required.",
        { code: "MANUAL_CARD_FORBIDDEN", payment_intent: publicPaymentIntentView(intent) }
      );
    }
  }

  const amountTendered = charge.amount_tendered != null ? charge.amount_tendered : null;
  const changeDue = charge.change_due != null ? charge.change_due : null;

  const receiptNumber = makeReceiptNumber("sale");
  const occurredAt = new Date().toISOString();
  let brandSnap = { name: null, logo_url: null };
  try {
    brandSnap = await loadBrandSnapshot(gate.membership.orgId, companyId);
  } catch {
    brandSnap = { name: null, logo_url: null };
  }
  const snapshot = {
    brand_name: brandSnap.name || (body.brand_name ? String(body.brand_name).slice(0, 120) : null),
    brand_logo_url: brandSnap.logo_url || null,
    cashier_name: body.cashier_name ? String(body.cashier_name).slice(0, 120) : null,
    customer_name: body.customer_name ? String(body.customer_name).slice(0, 120) : null,
    customer_email: body.customer_email ? String(body.customer_email).slice(0, 254) : null,
    subtotal: payable.subtotal,
    discount_amount: payable.discount_amount,
    tax_amount: payable.tax_amount,
    tax_rate: payable.tax_rate,
    amount_tendered: amountTendered,
    change_due: changeDue,
    settlement: isTillCashSettlement(rail) ? "till" : isCardTerminalSettlement(rail) ? "terminal" : "online",
  };

  const insertPayload = {
    org_id: gate.membership.orgId,
    connection_id: connection.id,
    external_id: idempotencyKey,
    provider: "paidly",
    status: "completed",
    total_amount: payable.total,
    currency,
    payment_method: paymentMethod,
    occurred_at: occurredAt,
    items: withSaleLineIds(built.lines),
    inventory_applied: false,
    receipt_number: receiptNumber,
    client_id: clientId,
    company_id: companyId || null,
    cashier_id: gate.user.id,
    sale_kind: "sale",
    amount_tendered: amountTendered,
    change_due: changeDue,
    payment_intent_id: intent.id,
    register_id: register?.id || null,
    session_id: session?.id || null,
    raw_payload: snapshot,
  };
  if (!insertPayload.register_id) delete insertPayload.register_id;
  if (!insertPayload.session_id) delete insertPayload.session_id;

  let { data: inserted, error: insertError } = await supabaseAdmin
    .from("pos_sales_events")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError && /register_id/i.test(insertError.message || "")) {
    delete insertPayload.register_id;
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from("pos_sales_events")
      .insert(insertPayload)
      .select("*")
      .single());
  }
  if (insertError && /session_id/i.test(insertError.message || "")) {
    delete insertPayload.session_id;
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from("pos_sales_events")
      .insert(insertPayload)
      .select("*")
      .single());
  }

  if (insertError) {
    if (insertError.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("pos_sales_events")
        .select("*")
        .eq("connection_id", connection.id)
        .eq("external_id", idempotencyKey)
        .maybeSingle();
      if (raced?.id) {
        return settleRecordedSaleInventory(res, {
          orgId: gate.membership.orgId,
          sale: raced,
          items: Array.isArray(raced.items) ? raced.items : built.lines,
          direction: "out",
          intent,
          duplicate: true,
          actorId: gate.user.id,
        });
      }
    }
    return jsonError(res, 500, mapMissingSchema(insertError.message));
  }

  await recordPosAuditEvents(
    posAuditSaleCreatedAndPayment({
      orgId: gate.membership.orgId,
      saleId: inserted.id,
      intentId: intent?.id || null,
      actorId: gate.user.id,
      actorType: POS_AUDIT_ACTOR.USER,
      receiptNumber: inserted.receipt_number || inserted.external_id,
      saleKind: inserted.sale_kind || "sale",
      amount: inserted.total_amount,
      currency: inserted.currency,
      method: inserted.payment_method || paymentMethod,
    })
  );

  const settled = await settleRecordedSaleInventory(res, {
    orgId: gate.membership.orgId,
    sale: inserted,
    items: built.lines,
    direction: "out",
    intent,
    actorId: gate.user.id,
  });

  if (res.statusCode === 201) {
    await supabaseAdmin
      .from("pos_connections")
      .update({ last_event_at: occurredAt, updated_at: occurredAt })
      .eq("id", connection.id);
  }

  return settled;
}

/**
 * POST /api/pos/return
 * Append-only: inserts sale_kind=return against parent_event_id. Never deletes the original sale.
 */
export async function handleNativePosReturn(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_REFUND)) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const saleId = String(body.sale_id || "").trim();
  if (!saleId) return jsonError(res, 422, "sale_id is required");

  const refundAsCash = body.refund_as_cash === true;
  const idempotencyKey = String(body.idempotency_key || "").trim() || `return-${saleId}-${crypto.randomUUID()}`;

  let connection;
  try {
    connection = await ensureNativePosConnection(gate.membership.orgId, gate.user.id);
  } catch (err) {
    return jsonError(res, 500, mapMissingSchema(err?.message));
  }

  const { data: original, error: originalError } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("id", saleId)
    .eq("org_id", gate.membership.orgId)
    .maybeSingle();

  if (originalError) return jsonError(res, 500, originalError.message || "Could not load sale");
  if (!original) return jsonError(res, 404, "Sale not found");
  if ((original.sale_kind || "sale") !== "sale") {
    return jsonError(res, 422, "Only completed sales can be returned");
  }
  if (original.status !== "completed" || !original.inventory_applied) {
    return jsonError(res, 422, "Only sales that already decremented stock can be returned");
  }

  const { data: priorReturns, error: priorError } = await supabaseAdmin
    .from("pos_sales_events")
    .select("id, items, total_amount, status, sale_kind")
    .eq("org_id", gate.membership.orgId)
    .eq("parent_event_id", original.id)
    .eq("sale_kind", "return");

  if (priorError && !/sale_kind|parent_event_id/i.test(priorError.message || "")) {
    return jsonError(res, 500, priorError.message || "Could not load prior returns");
  }

  const allocated = allocateReturnLines(original.items || [], priorReturns || [], body.items);
  if (!allocated.ok) {
    return jsonError(res, 422, allocated.error, { code: allocated.code });
  }

  const productIds = allocated.lines.map((row) => row.product_id);
  let catalogById;
  try {
    catalogById = await loadCatalogMap(gate.membership.orgId, productIds);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load products");
  }

  const originalById = new Map();
  for (const item of original.items || []) {
    if (item.product_id) originalById.set(String(item.product_id), item);
  }

  const built = buildCheckoutLines(allocated.lines, catalogById, {
    requireStock: false,
    allowPriceOverride: false,
  });
  if (!built.ok) return jsonError(res, 422, built.error);

  const pricedLines = withSaleLineIds(built.lines.map((line) => {
    const orig = originalById.get(line.product_id);
    const unitPrice = orig?.unit_price != null ? roundMoney(orig.unit_price) : line.unit_price;
    return {
      ...line,
      line_id: orig?.line_id || line.line_id,
      unit_price: unitPrice,
      line_total: roundMoney(unitPrice * line.quantity),
    };
  }));
  const subtotal = roundMoney(pricedLines.reduce((sum, line) => sum + line.line_total, 0));
  const refundRail = refundRailForSale(original.payment_method, { refundAsCash });
  const paymentMethod = paymentMethodForRefundRail(refundRail, original.payment_method);

  const { data: existing } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("external_id", idempotencyKey)
    .maybeSingle();
  if (existing?.id) {
    return settleRecordedSaleInventory(res, {
      orgId: gate.membership.orgId,
      sale: existing,
      items: Array.isArray(existing.items) ? existing.items : pricedLines,
      direction: "in",
      duplicate: true,
      originalSale: original,
      actorId: gate.user.id,
    });
  }

  let session = null;
  const returnRegisterId = original.register_id || null;
  if (returnRegisterId) {
    try {
      const resolvedSession = await resolveOpenSession(gate.membership.orgId, returnRegisterId);
      if (resolvedSession.missingSchema) {
        session = null;
      } else if (!resolvedSession.ok) {
        return jsonError(res, 422, resolvedSession.error, { code: resolvedSession.code });
      } else {
        session = resolvedSession.session;
      }
    } catch (err) {
      const mapped = mapMissingSchema(err?.message);
      if (/database update|pos_register_sessions|session_id/i.test(mapped)) {
        session = null;
      } else {
        return jsonError(res, 500, mapped);
      }
    }
  }

  const occurredAt = new Date().toISOString();
  const insertPayload = {
    org_id: gate.membership.orgId,
    connection_id: connection.id,
    external_id: idempotencyKey,
    provider: "paidly",
    status: "completed",
    total_amount: roundMoney(-subtotal),
    currency: original.currency || "ZAR",
    payment_method: paymentMethod,
    occurred_at: occurredAt,
    items: pricedLines,
    inventory_applied: false,
    receipt_number: makeReceiptNumber("return"),
    client_id: original.client_id || null,
    company_id: original.company_id || null,
    cashier_id: gate.user.id,
    sale_kind: "return",
    parent_event_id: original.id,
    register_id: original.register_id || null,
    session_id: session?.id || null,
    refund_rail: refundRail,
    original_payment_intent_id: original.payment_intent_id || null,
    raw_payload: {
      original_receipt: original.receipt_number || original.external_id,
      refund_rail: refundRail,
      original_payment_intent_id: original.payment_intent_id || null,
      refund_as_cash: refundAsCash,
    },
  };
  if (!insertPayload.register_id) delete insertPayload.register_id;
  if (!insertPayload.session_id) delete insertPayload.session_id;
  if (!insertPayload.original_payment_intent_id) delete insertPayload.original_payment_intent_id;

  let { data: inserted, error: insertError } = await supabaseAdmin
    .from("pos_sales_events")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError && /refund_rail|original_payment_intent_id|refund_status/i.test(insertError.message || "")) {
    delete insertPayload.refund_rail;
    delete insertPayload.original_payment_intent_id;
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from("pos_sales_events")
      .insert(insertPayload)
      .select("*")
      .single());
  }
  if (insertError && /session_id/i.test(insertError.message || "")) {
    delete insertPayload.session_id;
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from("pos_sales_events")
      .insert(insertPayload)
      .select("*")
      .single());
  }

  if (insertError) return jsonError(res, 500, mapMissingSchema(insertError.message));

  await recordPosAuditEvent(
    posAuditRefund({
      orgId: gate.membership.orgId,
      originalSaleId: original.id,
      returnId: inserted.id,
      actorId: gate.user.id,
      amount: inserted.total_amount,
      refundRail,
      receiptNumber: inserted.receipt_number || inserted.external_id,
    })
  );

  return settleRecordedSaleInventory(res, {
    orgId: gate.membership.orgId,
    sale: inserted,
    items: pricedLines,
    direction: "in",
    originalSale: original,
    actorId: gate.user.id,
  });
}
