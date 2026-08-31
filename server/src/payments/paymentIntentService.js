import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  assertCustomerPaymentProvider,
  isTillCashSettlement,
  isCardTerminalSettlement,
  publicPaymentIntentView,
} from "./paymentIntentContract.js";
import { getCustomerPaymentProvider } from "./paymentProviders.js";
import { settleTillCash, tillCashIntentMetadata } from "../pos/posCashSettlement.js";

export function mapPaymentIntentSchemaError(message) {
  const msg = String(message || "");
  if (/payment_intents/i.test(msg) && /schema cache|does not exist|could not find the table/i.test(msg)) {
    return "Payment intents table is missing. Run supabase/migrations/20260828180000_payment_intents.sql and supabase/migrations/20260828190000_payment_intents_card_terminal.sql in the Supabase SQL Editor.";
  }
  return msg || "Database error";
}

export async function findPaymentIntentByIdempotency(orgId, idempotencyKey) {
  if (!idempotencyKey) return null;
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Create a customer payment intent. Does not charge and does not move inventory.
 * POS stock decreases only after this intent is `paid` and `pos_sales_events` is written.
 */
export async function createPaymentIntentRow({
  orgId,
  sourceKind,
  provider,
  amount,
  currency,
  idempotencyKey,
  clientId,
  companyId,
  createdBy,
  documentId,
  documentType,
  metadata,
  expiresAt,
}) {
  const rail = assertCustomerPaymentProvider(provider, sourceKind);
  const existing = await findPaymentIntentByIdempotency(orgId, idempotencyKey);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .insert({
      org_id: orgId,
      source_kind: sourceKind,
      provider: rail,
      amount,
      currency,
      status: "pending",
      idempotency_key: idempotencyKey || null,
      client_id: clientId || null,
      company_id: companyId || null,
      created_by: createdBy || null,
      document_id: documentId || null,
      document_type: documentType || null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
      expires_at: expiresAt || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" && idempotencyKey) {
      const raced = await findPaymentIntentByIdempotency(orgId, idempotencyKey);
      if (raced) return raced;
    }
    throw error;
  }
  return data;
}

export async function confirmPaymentIntent(intent, chargeCtx = {}) {
  if (!intent?.id) {
    const error = new Error("Payment intent is required");
    error.code = "INTENT_REQUIRED";
    throw error;
  }
  if (isTillCashSettlement(intent.provider)) {
    const error = new Error("Cash is settled on the till, not through an online payment provider");
    error.code = "CASH_NOT_ONLINE_PROVIDER";
    throw error;
  }
  if (intent.status === "paid") return { intent, charge: { status: "paid", duplicate: true } };

  const provider = getCustomerPaymentProvider(intent.provider);
  const charge = await provider.createCharge(intent, chargeCtx);
  let nextStatus = charge.status || "failed";
  if (isCardTerminalSettlement(intent.provider) && nextStatus === "paid" && !charge.terminal_confirmed) {
    nextStatus = "requires_action";
    charge.status = "requires_action";
    charge.code = "MANUAL_CARD_FORBIDDEN";
    charge.error =
      "Card cannot be marked paid from a till click. A connected terminal or webhook confirmation is required.";
  }
  const metadata = {
    ...(intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {}),
    code: charge.code || null,
    next_action: charge.next_action || null,
    last_error: charge.error || null,
  };

  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      status: nextStatus,
      external_id: charge.external_id || intent.external_id || null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .select("*")
    .single();

  if (error) throw error;
  return { intent: data, charge };
}

/**
 * Cashier-counted cash. Writes the same payment_intents row as online rails,
 * without calling a PSP.
 */
export async function settleTillCashIntent(intent, amountTendered) {
  if (!intent?.id) {
    const error = new Error("Payment intent is required");
    error.code = "INTENT_REQUIRED";
    throw error;
  }
  if (!isTillCashSettlement(intent.provider)) {
    const error = new Error("This payment intent is not till cash");
    error.code = "NOT_TILL_CASH";
    throw error;
  }
  if (intent.status === "paid") {
    const metadata = intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
    return {
      intent,
      charge: {
        status: "paid",
        duplicate: true,
        amount_tendered: metadata.amount_tendered ?? null,
        change_due: metadata.change_due ?? null,
      },
    };
  }

  const settled = settleTillCash(intent.amount, amountTendered);
  if (!settled.ok) {
    return { intent, charge: { status: "failed", error: settled.error, code: settled.code } };
  }

  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      status: "paid",
      external_id: `till-cash:${intent.id}`,
      metadata: tillCashIntentMetadata(intent.metadata, settled),
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .select("*")
    .single();

  if (error) throw error;
  return {
    intent: data,
    charge: {
      status: "paid",
      amount_tendered: settled.amountTendered,
      change_due: settled.changeDue,
    },
  };
}

export async function attachPosSaleToIntent(intentId, saleId) {
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      pos_sale_event_id: saleId,
      status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", intentId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getOrgPaymentIntent(orgId, intentId) {
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", intentId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export { publicPaymentIntentView };
