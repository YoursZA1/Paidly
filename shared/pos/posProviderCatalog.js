/**
 * POS payment providers a business can pick from in Settings → POS → Payment provider.
 * Only providers with a real Paidly implementation are listed. None is the default.
 *
 *   connect:
 *     yoco_key      business pastes its Yoco secret key (stored encrypted server-side)
 *     square_oauth  business authorises Paidly in Square
 *     platform      credentials are held by Paidly on this deployment (no per-business account yet)
 *     coming_soon   adapter not live for businesses yet
 *
 * A provider without an adapter can only be recorded as a custom-provider REQUEST — it is never
 * shown as connected and never selectable at checkout.
 */

export const POS_PROVIDER_KIND_LABEL = Object.freeze({
  card_reader: "Card machine",
  online_eft: "Instant EFT",
  card_terminal: "Tap to pay / QR",
});

export const POS_PROVIDER_OPTIONS = Object.freeze([
  {
    id: "yoco",
    label: "Yoco",
    kind: "card_reader",
    connect: "yoco_key",
    description: "Take card payments on your Yoco machine. Sales sync to Paidly and stock updates.",
  },
  {
    id: "square",
    label: "Square",
    kind: "card_reader",
    connect: "square_oauth",
    description: "Take card payments on Square. Sign in with Square to authorise Paidly.",
  },
  {
    id: "ozow",
    label: "Ozow",
    kind: "online_eft",
    connect: "platform",
    description:
      "Instant EFT for the EFT / Digital button. Available when Paidly has Ozow configured — you don't connect your own Ozow account yet.",
  },
  {
    id: "paidly_pay",
    label: "Paidly Pay",
    kind: "card_terminal",
    connect: "coming_soon",
    description: "Tap to pay and QR on a phone. Not live for businesses yet.",
  },
]);

/** Providers people ask for that are deliberately not POS options, with the honest reason. */
export const POS_PROVIDER_NOT_SUPPORTED = Object.freeze({
  payfast:
    "PayFast is what Paidly uses for your subscription billing. It isn't built as a till payment provider, so it can't take POS payments. Add it as your own provider if you'd like Paidly to support it.",
});

export const CUSTOM_PROVIDER_METHODS = Object.freeze([
  { id: "card_terminal", label: "Card machine / terminal" },
  { id: "online_eft", label: "Online / instant EFT" },
  { id: "qr", label: "QR payments" },
  { id: "wallet", label: "Mobile wallet" },
  { id: "other", label: "Other" },
]);

export function posProviderOption(id) {
  return POS_PROVIDER_OPTIONS.find((p) => p.id === String(id || "").toLowerCase()) || null;
}
