import { formatHttpStatusMessage } from "@/utils/apiErrorText";

/**
 * PayFast subscription / once-off checkout
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
 */
const getPayfastApiBase = () => {
  if (import.meta.env.DEV) return "";
  const url = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
  // Production default should be same-origin (/api on current deployment), not localhost.
  return url;
};

const submitPayfastForm = (payfastUrl, fields) => {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payfastUrl;
  form.style.display = "none";

  Object.entries(fields || {}).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};

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

  async startOneTimePayment({
    invoiceId,
    amount,
    currency = "ZAR",
    clientName,
    clientEmail,
    returnPath = window.location.pathname + window.location.search,
    cancelPath = window.location.pathname + window.location.search
  }) {
    const payload = {
      invoiceId,
      amount,
      currency,
      clientName,
      clientEmail,
      returnUrl: buildReturnUrl(returnPath),
      cancelUrl: buildReturnUrl(cancelPath)
    };

    let response;
    try {
      response = await fetch(`${getPayfastApiBase()}/api/payfast/once`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      const msg = networkError?.message || String(networkError);
      if (msg.includes("Failed to fetch") || msg.includes("Connection refused") || msg.includes("NetworkError")) {
        const hint = import.meta.env.DEV
          ? "Start the backend with: npm run server"
          : "Set VITE_SERVER_URL to your payment API and ensure the server is running";
        throw new Error(`Payment server is unavailable. ${hint}.`);
      }
      throw networkError;
    }

    if (!response.ok) {
      throw await this.readApiError(response, "Failed to start Payfast payment");
    }

    const data = await response.json();
    if (!data?.payfastUrl || !data?.fields?.signature) {
      throw new Error("Invalid Payfast response: missing signed fields");
    }

    submitPayfastForm(data.payfastUrl, data.fields);
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
