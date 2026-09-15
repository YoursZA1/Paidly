import { supabaseAdmin } from "../supabaseAdmin.js";
import { attachPosSaleToIntent } from "../payments/paymentEngine.js";
import { commitNativePosInventory } from "../pos/posInventorySync.js";
import { makeReceiptNumber, roundMoney } from "../pos/posCheckoutMath.js";
import { withSaleLineIds } from "../pos/posReturnMath.js";
import { recordPosAuditEvents } from "../pos/posAudit.js";
import {
  POS_AUDIT_ACTOR,
  posAuditInventoryAndCompletion,
  posAuditSaleCreatedAndPayment,
} from "../pos/posAuditMath.js";
import { isConfirmedPaymentIntent } from "../../../shared/payments/paymentIntentStates.js";
import { tillMethodForPaidlyPayMethod } from "../../../shared/payments/paidlyPayContract.js";

function checkoutSnapshot(intent) {
  const metadata = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  return metadata.checkout && typeof metadata.checkout === "object" ? metadata.checkout : null;
}

/**
 * Settlement adapter: verified POS payment_intents → existing pos_sales_events.
 * Does not create a second sale table or invoice.
 */
export async function settlePosIntent(intent, { actorType = POS_AUDIT_ACTOR.WEBHOOK } = {}) {
  if (!intent?.id || intent.source_kind !== "pos") {
    return { settled: false, reason: "not_pos" };
  }
  if (!isConfirmedPaymentIntent(intent.status)) {
    return { settled: false, reason: "not_paid" };
  }
  if (intent.pos_sale_event_id) {
    return { settled: true, duplicate: true, saleId: intent.pos_sale_event_id };
  }

  const snapshot = checkoutSnapshot(intent);
  if (!snapshot) {
    console.error("[paidly-pay] paid POS intent missing checkout snapshot", intent.id);
    return { settled: false, reason: "missing_checkout_snapshot" };
  }

  const externalId = snapshot.idempotency_key || `intent:${intent.id}`;
  if (snapshot.connection_id) {
    const { data: existing } = await supabaseAdmin
      .from("pos_sales_events")
      .select("*")
      .eq("connection_id", snapshot.connection_id)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing?.id) {
      await attachPosSaleToIntent(intent.id, existing.id).catch(() => null);
      return { settled: true, duplicate: true, saleId: existing.id, sale: existing };
    }
  }

  const occurredAt = new Date().toISOString();
  const receiptNumber = snapshot.receipt_number || makeReceiptNumber("sale");
  const paymentMethod =
    snapshot.payment_method ||
    tillMethodForPaidlyPayMethod(snapshot.paidly_pay_method) ||
    "card";
  const items = withSaleLineIds(Array.isArray(snapshot.items) ? snapshot.items : []);
  const insertPayload = {
    org_id: intent.org_id,
    connection_id: snapshot.connection_id || null,
    external_id: externalId,
    provider: "paidly",
    status: "completed",
    total_amount: roundMoney(intent.amount),
    currency: intent.currency || "ZAR",
    payment_method: paymentMethod,
    occurred_at: occurredAt,
    items,
    inventory_applied: false,
    receipt_number: receiptNumber,
    client_id: snapshot.client_id || intent.client_id || null,
    company_id: snapshot.company_id || intent.company_id || null,
    cashier_id: snapshot.cashier_id || intent.created_by || null,
    sale_kind: "sale",
    payment_intent_id: intent.id,
    register_id: snapshot.register_id || null,
    session_id: snapshot.session_id || null,
    raw_payload: {
      brand_name: snapshot.brand_name || null,
      brand_logo_url: snapshot.brand_logo_url || null,
      cashier_name: snapshot.cashier_name || null,
      customer_name: snapshot.customer_name || null,
      customer_email: snapshot.customer_email || null,
      subtotal: snapshot.subtotal ?? null,
      discount_amount: snapshot.discount_amount ?? 0,
      tax_amount: snapshot.tax_amount ?? 0,
      tax_rate: snapshot.tax_rate ?? 0,
      settlement: "terminal",
      origin: "paidly_pay",
    },
  };
  if (!insertPayload.register_id) delete insertPayload.register_id;
  if (!insertPayload.session_id) delete insertPayload.session_id;
  if (!insertPayload.connection_id) delete insertPayload.connection_id;

  let { data: inserted, error: insertError } = await supabaseAdmin
    .from("pos_sales_events")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError && /register_id|session_id|connection_id/i.test(insertError.message || "")) {
    delete insertPayload.register_id;
    delete insertPayload.session_id;
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from("pos_sales_events")
      .insert(insertPayload)
      .select("*")
      .single());
  }

  if (insertError) {
    if (insertError.code === "23505" && snapshot.connection_id) {
      const { data: raced } = await supabaseAdmin
        .from("pos_sales_events")
        .select("*")
        .eq("connection_id", snapshot.connection_id)
        .eq("external_id", externalId)
        .maybeSingle();
      if (raced?.id) {
        await attachPosSaleToIntent(intent.id, raced.id).catch(() => null);
        return { settled: true, duplicate: true, saleId: raced.id, sale: raced };
      }
    }
    throw insertError;
  }

  await recordPosAuditEvents(
    posAuditSaleCreatedAndPayment({
      orgId: intent.org_id,
      saleId: inserted.id,
      intentId: intent.id,
      actorType,
      receiptNumber: inserted.receipt_number || inserted.external_id,
      saleKind: "sale",
      amount: inserted.total_amount,
      currency: inserted.currency,
      method: inserted.payment_method || paymentMethod,
    })
  );

  const inventory = await commitNativePosInventory(supabaseAdmin, {
    orgId: intent.org_id,
    saleEventId: inserted.id,
    items,
    direction: "out",
    paymentSettled: true,
  });

  await supabaseAdmin
    .from("pos_sales_events")
    .update({
      inventory_applied: !!inventory.applied && !inventory.failed,
      inventory_result: inventory.results,
      status: inventory.failed ? "failed" : "completed",
    })
    .eq("id", inserted.id);

  await recordPosAuditEvents(
    posAuditInventoryAndCompletion({
      orgId: intent.org_id,
      saleId: inserted.id,
      actorType,
      direction: "out",
      applied: inventory.applied,
      failed: Boolean(inventory.failed),
      skip: Boolean(inventory.duplicate),
    })
  );

  const linked = await attachPosSaleToIntent(intent.id, inserted.id);
  return {
    settled: true,
    duplicate: false,
    saleId: inserted.id,
    sale: inserted,
    intent: linked,
    inventory,
  };
}
