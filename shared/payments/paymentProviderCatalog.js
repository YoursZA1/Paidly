/**
 * Customer payment provider catalog — public, secret-free descriptors.
 *
 * Paidly POS and invoices talk to the Payment Engine, never to a provider directly.
 * This file is what the UI (till, settings, admin, timelines) may know about a provider:
 * its id, display label and what kind of rail it is. Credentials, hashes and webhooks stay
 * in server/src/payments/providers/<id>Provider.js.
 *
 * Adding a provider:
 *   1. Add a descriptor here (id must match payment_intents.provider).
 *   2. Add an adapter in server/src/payments/providers/ and register it in paymentProviders.js.
 *   3. Extend the payment_intents.provider CHECK constraint in a new migration.
 * The POS and invoice flows pick it up through the engine without code changes.
 */

/** Rail kinds. `online` = hosted/redirect payment confirmed by a verified webhook. */
export const PAYMENT_PROVIDER_KIND = Object.freeze({
  ONLINE: "online",
  TERMINAL: "terminal",
  TILL: "till",
});

/** Till tender that an online provider serves ("EFT / Digital" on the POS). */
export const ONLINE_TENDER = "digital";

export const PAYMENT_PROVIDER_CATALOG = Object.freeze({
  ozow: Object.freeze({
    id: "ozow",
    label: "Ozow",
    kind: PAYMENT_PROVIDER_KIND.ONLINE,
    description: "Instant EFT payment provider",
  }),
  card_terminal: Object.freeze({
    id: "card_terminal",
    label: "Card terminal",
    kind: PAYMENT_PROVIDER_KIND.TERMINAL,
    description: "Card-present terminal (Paidly Pay, Yoco or Square reader)",
  }),
  cash: Object.freeze({
    id: "cash",
    label: "Cash",
    kind: PAYMENT_PROVIDER_KIND.TILL,
    description: "Counted on the till or recorded as an approved offline receipt",
  }),
});

/** Human label for a payment_intents.provider value. Unknown ids fall back to a neutral label. */
export function paymentProviderLabel(providerId, fallback = "Payment provider") {
  const id = String(providerId || "").trim().toLowerCase();
  if (!id) return fallback;
  return PAYMENT_PROVIDER_CATALOG[id]?.label || fallback;
}

export function isOnlineProviderId(providerId) {
  const id = String(providerId || "").trim().toLowerCase();
  return PAYMENT_PROVIDER_CATALOG[id]?.kind === PAYMENT_PROVIDER_KIND.ONLINE;
}
