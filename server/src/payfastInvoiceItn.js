/**
 * PayFast ITN: one-time invoice payments. Expects custom_str1 "invoice:<uuid>".
 */

import { isValidUuid } from "./inputValidation.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} payload
 */
export async function processPayfastInvoiceItn(supabase, payload) {
  const paymentStatus = String(payload.payment_status || "").toUpperCase();
  if (paymentStatus !== "COMPLETE") return;

  const customStr1 = String(payload.custom_str1 || "");
  if (!customStr1.startsWith("invoice:")) return;

  const invoiceId = customStr1.split(":")[1]?.trim();
  if (!invoiceId || !isValidUuid(invoiceId)) {
    console.error("[payfast-itn] Missing or invalid invoice id in custom_str1", customStr1);
    return;
  }

  const paymentAmountRaw = payload.amount_gross ?? payload.amount;
  const paymentAmount = Number(paymentAmountRaw);

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    console.error("[payfast-itn] Invalid payment amount", paymentAmountRaw);
    return;
  }

  try {
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("id, org_id, client_id, total_amount, status")
      .eq("id", invoiceId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[payfast-itn] Failed to load invoice", invoiceError.message);
      return;
    }

    if (!invoice) {
      console.error("[payfast-itn] Invoice not found", invoiceId);
      return;
    }

    const { data: existingPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount")
      .eq("invoice_id", invoiceId);

    if (paymentsError) {
      console.error("[payfast-itn] Failed to load existing payments", paymentsError.message);
      return;
    }

    const alreadyPaid = (existingPayments || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );
    const newTotalPaid = alreadyPaid + paymentAmount;
    const invoiceTotal = Number(invoice.total_amount || 0);

    let newStatus = invoice.status;
    if (invoiceTotal > 0) {
      if (newTotalPaid >= invoiceTotal - 0.01) {
        newStatus = "paid";
      } else if (newTotalPaid > 0 && invoice.status !== "paid") {
        newStatus = "partial_paid";
      }
    }

    const nowIso = new Date().toISOString();
    const reference = String(payload.pf_payment_id || payload.m_payment_id || "");

    const { error: insertError } = await supabase.from("payments").insert({
      org_id: invoice.org_id,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      amount: paymentAmount,
      payment_date: nowIso,
      payment_method: "payfast",
      reference_number: reference,
      notes: "PayFast one-time payment",
    });

    if (insertError) {
      console.error("[payfast-itn] Failed to insert payment", insertError.message);
      throw new Error(insertError.message);
    }

    if (newStatus && newStatus !== invoice.status) {
      const { error: updateError } = await supabase
        .from("invoices")
        .update({ status: newStatus })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("[payfast-itn] Failed to update invoice status", updateError.message);
      }
    }

    console.log("[payfast-itn] Recorded payment for invoice", {
      invoiceId,
      paymentAmount,
      status: newStatus,
    });
  } catch (err) {
    console.error("[payfast-itn] Unexpected error", err);
  }
}
