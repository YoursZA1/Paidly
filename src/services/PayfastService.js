import { formatHttpStatusMessage } from "@/utils/apiErrorText";

/**
 * PayFast SaaS subscription checkout
 *
 * Guards (do not regress):
 * - Subscription/plan changes are applied in the verified ITN webhook (`payfastSubscriptionItn.js`), not by updating the user from the frontend.
 * - Checkout must send `userId` so PayFast payloads link to the payer (`m_payment_id`, `custom_str1`).
 * - Webhook must verify the PayFast signature before trusting `req.body` / payload fields.
 * - Platform state includes `public.subscriptions` plus `profiles` plan fields (ITN upserts both).
 *
 * ## SaaS plan checkout (preferred)
 * Use `subscriptionCheckoutService.createSubscriptionAndRedirect` →
 * `POST /api/subscriptions/create` (planSlug only). Return page polls
 * `GET /api/subscriptions/status`. Never set status active on the client.
 * ITN: `/api/payfast/itn`.
 *
 * `startSubscription` delegates to that flow. Legacy client-priced
 * `POST /api/payfast/subscription` returns 410 and must not be used.
 *
 * PayFast is Paidly's own SaaS billing only. Customer invoice / POS money goes through the Payment
 * Engine (POST /api/payment-intents/document-pay → Ozow); the old once-off invoice checkout
 * (`/api/payfast/once`) returns 410 and its client helper was removed.
 */
const buildReturnUrl = (path) => {
  const base = window.location.origin;
  return `${base}${path}`;
};

const PayfastService = {
  async readApiError(response, fallbackMessage) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      try {
        const text = await response.text();
        if (text) payload = { error: text };
      } catch {
        payload = null;
      }
    }
    const base =
      (typeof payload?.error === "string" ? payload.error : null) ||
      payload?.message ||
      fallbackMessage;
    const code = typeof payload?.code === "string" ? payload.code : null;
    const msg = code ? `${base} (${code})` : `${base} (${formatHttpStatusMessage(response.status)})`;
    return new Error(msg);
  },

  async startSubscription({
    plan,
    planSlug,
    returnPath = "/Settings?tab=subscription",
    cancelPath = "/Settings?tab=subscription",
    returnUrl: returnUrlAbsolute,
    cancelUrl: cancelUrlAbsolute,
  }) {
    const { createSubscriptionAndRedirect } = await import("@/services/subscriptionCheckoutService");
    const slug = String(planSlug || plan || "").trim();
    if (!slug) {
      throw new Error("planSlug is required. Amounts are loaded server-side from the plans catalog.");
    }
    return createSubscriptionAndRedirect({
      planSlug: slug,
      returnUrl: returnUrlAbsolute || buildReturnUrl(returnPath),
      cancelUrl: cancelUrlAbsolute || buildReturnUrl(cancelPath),
    });
  }

};

export default PayfastService;
