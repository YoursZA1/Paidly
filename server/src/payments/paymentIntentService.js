import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  assertCustomerPaymentProvider,
  isTillCashSettlement,
  isCardTerminalSettlement,
  publicPaymentIntentView,
} from "./paymentIntentContract.js";
import { getCustomerPaymentProvider } from "./paymentProviders.js";
import { settleTillCash, tillCashIntentMetadata } from "../pos/posCashSettlement.js";
import {
  applyPaymentIntentTransition,
  PAYMENT_INTENT_STATUS,
  paymentIntentIsExpired,
  isActivePaymentIntentStatus,
} from "../../../shared/payments/paymentIntentStates.js";
import { assertPaymentEngineSource } from "../../../shared/payments/paymentEngine.js";
import { CARD_RAIL_UNAVAILABLE, cardTerminalRailEnabled } from "../../../shared/payments/paidlyPayContract.js";

/** Throws when the card / terminal rail is off (production: no acquirer can prove a card charge). */
export function assertCardRailAvailable(provider) {
  if (!isCardTerminalSettlement(provider) || cardTerminalRailEnabled()) return;
  const error = new Error("Card payments are not available yet. Take cash, or use Ozow (instant EFT).");
  error.code = CARD_RAIL_UNAVAILABLE;
  error.status = 422;
  throw error;
}

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
 * Reuse an in-flight POS card intent for the same checkout fingerprint.
 * Expired / cancelled / failed rows are ignored so the cashier can retry.
 */
export async function findActivePosCheckoutIntent({
  orgId,
  fingerprint,
  companyId = null,
  amount = null,
} = {}) {
  const key = String(fingerprint || "").trim();
  if (!orgId || !key) return null;
  let query = supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", orgId)
    .eq("source_kind", "pos")
    .eq("provider", "card_terminal")
    .is("pos_sale_event_id", null)
    .in("status", ["pending", "requires_action", "processing"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (companyId) query = query.eq("company_id", companyId);
  if (amount != null && amount !== "") query = query.eq("amount", amount);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).find((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return String(metadata.checkout_fingerprint || "") === key && isActivePaymentIntentStatus(row.status);
  }) || null;
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
  const source = assertPaymentEngineSource(sourceKind);
  const rail = assertCustomerPaymentProvider(provider, source);
  assertCardRailAvailable(rail);
  const existing = await findPaymentIntentByIdempotency(orgId, idempotencyKey);
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .insert({
      org_id: orgId,
      source_kind: source,
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

export async function markPaymentIntentExpired(intent) {
  if (!intent?.id) return intent;
  const transition = applyPaymentIntentTransition(intent.status, PAYMENT_INTENT_STATUS.expired);
  if (!transition.ok) return intent;
  if (transition.same) return intent;
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      status: PAYMENT_INTENT_STATUS.expired,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("org_id", intent.org_id)
    .eq("status", intent.status)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data || intent;
}

export async function applyVerifiedIntentStatus(intent, nextStatus, extra = {}) {
  if (!intent?.id) {
    const error = new Error("Payment intent is required");
    error.code = "INTENT_REQUIRED";
    throw error;
  }
  const transition = applyPaymentIntentTransition(intent.status, nextStatus);
  if (!transition.ok) {
    const error = new Error(transition.error);
    error.code = transition.code;
    throw error;
  }
  if (transition.same) {
    return { intent, duplicate: true };
  }

  const metadata = {
    ...(intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {}),
    ...(extra.metadata && typeof extra.metadata === "object" ? extra.metadata : {}),
  };

  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      status: transition.next,
      external_id: extra.externalId || intent.external_id || null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("org_id", intent.org_id)
    .eq("status", intent.status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const latest = await getOrgPaymentIntent(intent.org_id, intent.id);
    if (latest && latest.status === transition.next) {
      return { intent: latest, duplicate: true };
    }
    return { intent: latest || intent, duplicate: true };
  }
  const { appendDocumentPaymentStatusEvent } = await import("./documentPaymentEventBridge.js");
  await appendDocumentPaymentStatusEvent(data, transition.next, {
    source: extra.source || "payment_webhook",
    metadata: extra.metadata,
  });
  return { intent: data, duplicate: false };
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
  if (paymentIntentIsExpired(intent)) {
    const expired = await markPaymentIntentExpired(intent);
    return {
      intent: expired,
      charge: { status: "expired", code: "INTENT_EXPIRED", error: "This payment intent has expired." },
    };
  }

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

  const transition = applyPaymentIntentTransition(intent.status, nextStatus);
  if (!transition.ok) {
    return {
      intent,
      charge: {
        ...charge,
        status: intent.status,
        code: transition.code,
        error: transition.error,
      },
    };
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
      status: transition.next,
      external_id: charge.external_id || intent.external_id || null,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("org_id", intent.org_id)
    .eq("status", intent.status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // A verified provider event moved it first (e.g. paid). Never overwrite that with a charge result.
    const latest = await getOrgPaymentIntent(intent.org_id, intent.id);
    return { intent: latest || intent, charge: { ...charge, status: latest?.status || intent.status, duplicate: true } };
  }
  if (data.status !== intent.status) {
    const { appendDocumentPaymentStatusEvent } = await import("./documentPaymentEventBridge.js");
    await appendDocumentPaymentStatusEvent(data, data.status, {
      source: "payment_confirm",
      metadata: { code: charge.code || null },
    });
  }
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

  // Same state machine as online rails: a cancelled / expired / failed cash intent is never paid.
  const transition = applyPaymentIntentTransition(intent.status, PAYMENT_INTENT_STATUS.paid);
  if (!transition.ok || paymentIntentIsExpired(intent)) {
    return {
      intent,
      charge: {
        status: intent.status,
        code: transition.ok ? "INTENT_EXPIRED" : transition.code,
        error: transition.ok ? "This payment intent has expired." : transition.error,
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
    .eq("org_id", intent.org_id)
    .eq("status", intent.status)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // Another request moved it first; report what it is now rather than overwriting it.
    const latest = await getOrgPaymentIntent(intent.org_id, intent.id);
    return { intent: latest || intent, charge: { status: latest?.status || intent.status, duplicate: true } };
  }
  return {
    intent: data,
    charge: {
      status: "paid",
      amount_tendered: settled.amountTendered,
      change_due: settled.changeDue,
    },
  };
}

/**
 * Link the POS sale to its intent. Only a paid intent can carry a sale, and only one sale: an intent
 * already linked to a different sale is never re-pointed (one payment, one sale). Idempotent for the
 * same sale. This never marks an intent paid (that is the verified provider event / till cash).
 */
export async function attachPosSaleToIntent(intentId, saleId) {
  const { data, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      pos_sale_event_id: saleId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intentId)
    .eq("status", PAYMENT_INTENT_STATUS.paid)
    .is("pos_sale_event_id", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: current, error: readError } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("id", intentId)
    .maybeSingle();
  if (readError) throw readError;
  if (current?.status === PAYMENT_INTENT_STATUS.paid && String(current.pos_sale_event_id) === String(saleId)) {
    return current;
  }
  if (current?.status === PAYMENT_INTENT_STATUS.paid && current.pos_sale_event_id) {
    const linked = new Error("This payment intent already settled another POS sale");
    linked.code = "INTENT_ALREADY_LINKED";
    throw linked;
  }
  const notPaid = new Error("Only a paid payment intent can be linked to a POS sale");
  notPaid.code = "INTENT_NOT_PAID";
  throw notPaid;
}

/** The sale a paid intent already settled, found by its payment_intent_id (any connection). */
export async function findSaleForIntent(orgId, intentId) {
  const { data, error } = await supabaseAdmin
    .from("pos_sales_events")
    .select("*")
    .eq("org_id", orgId)
    .eq("payment_intent_id", intentId)
    .eq("sale_kind", "sale")
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
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
