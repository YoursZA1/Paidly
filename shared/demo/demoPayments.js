/**
 * Demo Mode payment simulation — the single contract shared by the server and the SPA.
 *
 * In a demo workspace every non-cash tender (till "EFT / Digital", table bills, invoice "Pay now") is a
 * DEMO_PAYMENT: a real payment intent on the card_terminal rail flagged `demo_simulated`, which the
 * visitor resolves with one of the outcomes below. The outcome goes through the same verified-event
 * pipeline as a real provider webhook (applyVerifiedProviderEvent → sale / invoice settlement), so
 * transactions and reports are real — but no bank, gateway, PayFast or Ozow is ever called.
 */

export const DEMO_PAYMENT = "DEMO_PAYMENT";

export const DEMO_PAYMENT_PROVIDER = Object.freeze({
  id: "demo",
  label: "Demo payment (simulated)",
  demo: true,
});

/** Visitor-facing outcomes → payment intent outcome keys understood by mockOutcomeToIntentStatus. */
export const DEMO_PAYMENT_OUTCOMES = Object.freeze([
  { id: "succeeded", status: "SUCCESS", label: "Demo Payment Successful", tone: "success" },
  { id: "failed", status: "FAILED", label: "Demo Payment Failed", tone: "danger" },
  { id: "processing", status: "PENDING", label: "Demo Payment Pending", tone: "pending" },
]);

export const DEMO_PAYMENT_NOTICE = "Simulated payment — no money moves and no payment provider is contacted.";

export function isDemoPaymentOutcome(value) {
  const key = String(value || "").trim().toLowerCase();
  return DEMO_PAYMENT_OUTCOMES.some((o) => o.id === key);
}

export function demoPaymentOutcomeLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  return DEMO_PAYMENT_OUTCOMES.find((o) => o.id === key)?.label || "Demo payment";
}

/** next_action a demo intent returns instead of a redirect / terminal hand-off. */
export function demoPaymentNextAction(intentId = null) {
  return {
    type: "demo",
    display: "DEMO PAYMENT",
    demo: true,
    mock: true,
    provider: DEMO_PAYMENT_PROVIDER.id,
    payment_intent_id: intentId || null,
    open_url: null,
    redirect_url: null,
    notice: DEMO_PAYMENT_NOTICE,
  };
}

export function isDemoNextAction(nextAction) {
  return Boolean(nextAction && (nextAction.demo === true || nextAction.type === "demo"));
}
