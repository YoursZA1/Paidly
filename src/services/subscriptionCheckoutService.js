/**
 * SaaS subscription checkout (billing v2).
 *
 * Flow: select plan → POST /api/subscriptions/create → PayFast → return → poll status.
 * The frontend NEVER writes subscription.status = "active". It only displays backend status.
 */

import { getStableSession } from "@/core/auth/SessionCoordinator";
import { normalizePlanSlug } from "@/lib/plans.js";

const PENDING_SUB_KEY = "paidly_pending_subscription_id";
const PENDING_PLAN_KEY = "paidly_pending_plan_slug";

const getApiBase = () => {
  if (import.meta.env.DEV) return "";
  return (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
};

function submitPayfastForm(payfastUrl, fields, fieldOrder) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payfastUrl;
  form.style.display = "none";

  const src = fields && typeof fields === "object" ? fields : {};
  const orderedKeys = Array.isArray(fieldOrder) && fieldOrder.length
    ? fieldOrder.filter((k) => k !== "signature")
    : Object.keys(src).filter((k) => k !== "signature");

  orderedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(src, key)) return;
    const value = src[key];
    if (value == null || String(value).trim() === "") return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value);
    form.appendChild(input);
  });

  if (src.signature) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "signature";
    input.value = String(src.signature);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

async function readApiError(response, fallback) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const msg =
    (typeof payload?.error === "string" && payload.error) ||
    payload?.message ||
    fallback;
  const code = typeof payload?.code === "string" ? payload.code : null;
  return new Error(code ? `${msg} (${code})` : msg);
}

export function rememberPendingSubscription(subscriptionId, planSlug) {
  try {
    if (subscriptionId) sessionStorage.setItem(PENDING_SUB_KEY, String(subscriptionId));
    if (planSlug) sessionStorage.setItem(PENDING_PLAN_KEY, String(planSlug));
  } catch {
    /* private mode */
  }
}

export function getPendingSubscriptionId() {
  try {
    return sessionStorage.getItem(PENDING_SUB_KEY) || "";
  } catch {
    return "";
  }
}

export function clearPendingSubscription() {
  try {
    sessionStorage.removeItem(PENDING_SUB_KEY);
    sessionStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Checkout URLs for create + PayFast redirect.
 */
export function getSubscriptionCheckoutUrls() {
  const site = (import.meta.env.VITE_PAYFAST_PUBLIC_SITE_URL || window.location.origin).replace(
    /\/$/,
    ""
  );
  return {
    returnUrl: (import.meta.env.VITE_PAYFAST_RETURN_URL || `${site}/success`).replace(/\/$/, ""),
    cancelUrl: (import.meta.env.VITE_PAYFAST_CANCEL_URL || `${site}/cancel`).replace(/\/$/, ""),
    notifyUrl: (
      import.meta.env.VITE_PAYFAST_SUBSCRIPTION_NOTIFY_URL || `${site}/api/payfast/itn`
    ).trim(),
  };
}

/**
 * POST /api/subscriptions/create — pending only; amount from plans catalog (server).
 * Then navigate to PayFast via signed form POST (or window.location if only a URL).
 *
 * @param {{ planSlug: string }} opts
 */
export async function createSubscriptionAndRedirect({ planSlug }) {
  const slug = normalizePlanSlug(planSlug);
  if (!slug) throw new Error("Select a valid plan to continue.");

  const session = await getStableSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Please sign in to subscribe.");

  const { returnUrl, cancelUrl, notifyUrl } = getSubscriptionCheckoutUrls();

  let response;
  try {
    response = await fetch(`${getApiBase()}/api/subscriptions/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        planSlug: slug,
        returnUrl,
        cancelUrl,
        notifyUrl,
      }),
    });
  } catch (networkError) {
    const msg = networkError?.message || String(networkError);
    if (/Failed to fetch|Connection refused|NetworkError/i.test(msg)) {
      throw new Error(
        import.meta.env.DEV
          ? "Payment server unavailable. Start the backend (npm run server)."
          : "Payment server unavailable. Try again shortly."
      );
    }
    throw networkError;
  }

  if (!response.ok) {
    throw await readApiError(response, "Failed to create subscription");
  }

  const data = await response.json();
  const redirectUrl = data.redirectUrl || data.payfastUrl;
  if (!redirectUrl || !data?.fields?.signature) {
    throw new Error("Invalid checkout response: missing PayFast redirect");
  }

  // Remember id for return-page polling — never invent status client-side
  rememberPendingSubscription(data.subscriptionId, slug);

  submitPayfastForm(redirectUrl, data.fields, data.fieldOrder);
  return data;
}

/**
 * GET /api/subscriptions/status — display-only. Never mutates subscription status.
 *
 * @param {string} [subscriptionId]
 */
export async function fetchSubscriptionStatus(subscriptionId) {
  const session = await getStableSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Please sign in.");

  const q = subscriptionId
    ? `?subscriptionId=${encodeURIComponent(subscriptionId)}`
    : "";
  const response = await fetch(`${getApiBase()}/api/subscriptions/status${q}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw await readApiError(response, "Failed to load subscription status");
  }

  return response.json();
}

/**
 * Poll until backend reports currentStatus === "active" (or timeout).
 * Does not write any status locally.
 *
 * @param {{
 *   subscriptionId?: string,
 *   intervalMs?: number,
 *   maxAttempts?: number,
 *   onTick?: (status: object) => void,
 *   signal?: AbortSignal,
 * }} opts
 */
export async function pollUntilActive({
  subscriptionId,
  intervalMs = 3000,
  maxAttempts = 40,
  onTick,
  signal,
} = {}) {
  const id = subscriptionId || getPendingSubscriptionId();
  let last = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    try {
      last = await fetchSubscriptionStatus(id || undefined);
      onTick?.(last);
      const status = String(last?.currentStatus || last?.status || "").toLowerCase();
      if (last?.accessGranted || status === "active" || status === "trialing") {
        clearPendingSubscription();
        return last;
      }
      if (status === "failed" || status === "cancelled" || status === "expired") {
        return last;
      }
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      onTick?.({ error: e?.message || String(e), currentStatus: last?.currentStatus || null });
    }

    await new Promise((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true }
      );
    });
  }

  return last;
}
