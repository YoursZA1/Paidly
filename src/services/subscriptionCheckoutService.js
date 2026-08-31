/**
 * SaaS subscription checkout (billing v2).
 *
 * Flow: select plan → POST /api/subscriptions/create → PayFast form POST.
 * The frontend NEVER writes subscription.status = "active". It only displays backend status.
 * This call waits only for Paidly checkout data — never for PayFast ITN/payment.
 */

import { getStableSession } from "@/core/auth/SessionCoordinator";
import { useAuthSessionStore } from "@/stores/authSessionStore";
import { normalizePlanSlug } from "@/lib/plans.js";
import { promiseWithTimeout } from "@/utils/fetchWithTimeout";

const PENDING_SUB_KEY = "paidly_pending_subscription_id";
const PENDING_PLAN_KEY = "paidly_pending_plan_slug";

/** Hard cap so Subscribe cannot spin forever if getSession() or fetch stalls. */
export const CHECKOUT_REQUEST_TIMEOUT_MS = 30_000;
export const CHECKOUT_SESSION_TIMEOUT_MS = 8_000;

const USER_RETRY_MESSAGE =
  "Something went wrong while starting your subscription. Please try again.";

const getApiBase = () => {
  if (import.meta.env.DEV) return "";
  return (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
};

let checkoutInFlight = false;

export function isSubscriptionCheckoutInFlight() {
  return checkoutInFlight;
}

export function releaseSubscriptionCheckoutGuard() {
  checkoutInFlight = false;
}

/** Test-only alias. */
export function resetSubscriptionCheckoutGuardForTests() {
  releaseSubscriptionCheckoutGuard();
}

export class SubscriptionCheckoutError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, status?: number, retryable?: boolean }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "SubscriptionCheckoutError";
    this.code = meta.code || "CHECKOUT_FAILED";
    this.status = meta.status ?? null;
    this.retryable = meta.retryable !== false;
  }
}

/**
 * Map HTTP + API body to a user-facing checkout error (no secrets / stack traces).
 * @param {number} status
 * @param {object|null} payload
 */
export function checkoutErrorFromHttp(status, payload) {
  const code =
    (typeof payload?.code === "string" && payload.code) ||
    (typeof payload?.error?.code === "string" && payload.error.code) ||
    null;
  const raw =
    (typeof payload?.error === "string" && payload.error) ||
    (typeof payload?.error?.message === "string" && payload.error.message) ||
    (typeof payload?.message === "string" && payload.message) ||
    "";

  if (status === 401 || code === "AUTH_REQUIRED") {
    return new SubscriptionCheckoutError("Your session has expired. Please sign in again.", {
      code: "AUTH_REQUIRED",
      status: 401,
      retryable: true,
    });
  }
  if (status === 403 || code === "FORBIDDEN") {
    return new SubscriptionCheckoutError("You do not have permission to start this subscription.", {
      code: "FORBIDDEN",
      status: 403,
      retryable: true,
    });
  }
  if (status === 400 || status === 422) {
    const friendly =
      raw && raw.length < 180 && !/passphrase|merchant_key|service.role/i.test(raw)
        ? raw
        : "This plan cannot be checked out. Please choose another plan or try again.";
    return new SubscriptionCheckoutError(friendly, {
      code: code || "VALIDATION_ERROR",
      status,
      retryable: true,
    });
  }
  if (status === 409 || code === "CHECKOUT_IN_PROGRESS") {
    return new SubscriptionCheckoutError(
      raw || "A checkout is already in progress. Please try again in a moment.",
      { code: "CHECKOUT_IN_PROGRESS", status: 409, retryable: true }
    );
  }
  if (status >= 500 || code === "PAYFAST_SIGNATURE_ERROR" || code === "SUBSCRIPTION_CREATE_FAILED") {
    return new SubscriptionCheckoutError(USER_RETRY_MESSAGE, {
      code: code || "SERVER_ERROR",
      status: status || 500,
      retryable: true,
    });
  }
  return new SubscriptionCheckoutError(raw || USER_RETRY_MESSAGE, {
    code: code || "CHECKOUT_FAILED",
    status,
    retryable: true,
  });
}

function isPayfastProcessUrl(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== "www.payfast.co.za" && host !== "sandbox.payfast.co.za") return false;
    return parsed.pathname.replace(/\/$/, "") === "/eng/process";
  } catch {
    return false;
  }
}

const HANDOFF_RETRY_MESSAGE = "We couldn't open the PayFast payment page. Please try again.";

function newCheckoutRequestId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `chk_${Date.now().toString(36)}`;
}

function logSubscription(requestId, message, extra) {
  const prefix = `[SUBSCRIPTION][requestId=${requestId || "n/a"}]`;
  if (extra && typeof extra === "object") {
    console.info(prefix, message, extra);
  } else {
    console.info(prefix, message);
  }
}

function isPlainCheckoutValue(value) {
  if (value == null) return false;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  return false;
}

/**
 * Same-window POST to PayFast. Do not use window.open (popup blockers / iOS).
 * Do not use display:none — WebKit can ignore submit on hidden forms after an async fetch.
 * Do not encode values; the browser encodes the POST body once. Do not alter signature.
 *
 * @returns {true}
 */
export function submitPayfastCheckoutForm(payfastUrl, fields, fieldOrder, { requestId } = {}) {
  if (typeof document === "undefined") {
    throw new SubscriptionCheckoutError(HANDOFF_RETRY_MESSAGE, { code: "PAYFAST_REDIRECT_FAILED" });
  }

  const url = String(payfastUrl || "").trim();
  if (!isPayfastProcessUrl(url)) {
    logSubscription(requestId, "Checkout handoff failed", { reason: "invalid_url" });
    throw new SubscriptionCheckoutError(HANDOFF_RETRY_MESSAGE, { code: "PAYFAST_REDIRECT_FAILED" });
  }

  const src = fields && typeof fields === "object" ? fields : {};
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  form.acceptCharset = "utf-8";
  form.target = "_self";
  form.setAttribute("data-paidly-payfast-checkout", "1");
  // Off-screen but submittable. display:none is skipped by some iOS WebKit versions.
  form.setAttribute(
    "style",
    "position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;margin:0;padding:0;border:0;"
  );
  form.setAttribute("aria-hidden", "true");

  const orderedKeys =
    Array.isArray(fieldOrder) && fieldOrder.length
      ? fieldOrder.filter((k) => k !== "signature")
      : Object.keys(src).filter((k) => k !== "signature");

  orderedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(src, key)) return;
    const value = src[key];
    if (!isPlainCheckoutValue(value)) return;
    const asString = String(value);
    if (asString.trim() === "") return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = String(key);
    input.value = asString;
    form.appendChild(input);
  });

  if (!isPlainCheckoutValue(src.signature) || String(src.signature).trim() === "") {
    logSubscription(requestId, "Checkout handoff failed", { reason: "missing_signature" });
    throw new SubscriptionCheckoutError(HANDOFF_RETRY_MESSAGE, { code: "PAYFAST_REDIRECT_FAILED" });
  }

  const sig = document.createElement("input");
  sig.type = "hidden";
  sig.name = "signature";
  sig.value = String(src.signature);
  form.appendChild(sig);

  document.body.appendChild(form);
  logSubscription(requestId, "Checkout submitted");

  try {
    HTMLFormElement.prototype.submit.call(form);
  } catch {
    try {
      form.submit();
    } catch {
      logSubscription(requestId, "Checkout handoff failed", { reason: "submit_threw" });
      throw new SubscriptionCheckoutError(HANDOFF_RETRY_MESSAGE, { code: "PAYFAST_REDIRECT_FAILED" });
    }
  }

  return true;
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getCheckoutAccessToken() {
  try {
    const session = await promiseWithTimeout(() => getStableSession(), CHECKOUT_SESSION_TIMEOUT_MS);
    if (session?.access_token) return session.access_token;
  } catch {
    /* getSession can hang; fall through to in-memory store */
  }
  const stored = useAuthSessionStore.getState().session;
  if (stored?.accessToken) return stored.accessToken;
  throw new SubscriptionCheckoutError("Your session has expired. Please sign in again.", {
    code: "AUTH_REQUIRED",
    status: 401,
  });
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
 * Then navigate to PayFast via signed form POST.
 *
 * @param {{ planSlug: string, returnUrl?: string, cancelUrl?: string, notifyUrl?: string }} opts
 */
export async function createSubscriptionAndRedirect({ planSlug, returnUrl, cancelUrl, notifyUrl } = {}) {
  if (checkoutInFlight) {
    throw new SubscriptionCheckoutError("A checkout is already in progress. Please wait.", {
      code: "CHECKOUT_IN_PROGRESS",
      status: 409,
    });
  }

  const slug = normalizePlanSlug(planSlug);
  if (!slug) {
    throw new SubscriptionCheckoutError("Select a valid plan to continue.", {
      code: "VALIDATION_ERROR",
      status: 400,
    });
  }

  checkoutInFlight = true;
  let redirected = false;
  let requestId = newCheckoutRequestId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);
  logSubscription(requestId, "Start");

  try {
    const accessToken = await getCheckoutAccessToken();
    const urls = getSubscriptionCheckoutUrls();

    let response;
    try {
      response = await fetch(`${getApiBase()}/api/subscriptions/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          planSlug: slug,
          returnUrl: returnUrl || urls.returnUrl,
          cancelUrl: cancelUrl || urls.cancelUrl,
          ...(notifyUrl ? { notifyUrl } : {}),
        }),
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError?.name === "AbortError" || controller.signal.aborted) {
        throw new SubscriptionCheckoutError(USER_RETRY_MESSAGE, {
          code: "CHECKOUT_TIMEOUT",
          status: 408,
        });
      }
      const msg = networkError?.message || String(networkError);
      if (/Failed to fetch|Connection refused|NetworkError/i.test(msg)) {
        throw new SubscriptionCheckoutError(
          import.meta.env.DEV
            ? "Payment server unavailable. Start the backend (npm run server)."
            : "We couldn't connect to the payment service. Please try again.",
          { code: "NETWORK_ERROR", retryable: true }
        );
      }
      throw new SubscriptionCheckoutError(USER_RETRY_MESSAGE, { code: "NETWORK_ERROR" });
    }

    const data = await readJsonSafe(response);
    if (typeof data?.requestId === "string" && data.requestId.trim()) {
      requestId = data.requestId.trim();
    }

    if (!response.ok) {
      throw checkoutErrorFromHttp(response.status, data);
    }

    logSubscription(requestId, "API success");

    const checkoutUrl = data?.checkout?.url || data?.redirectUrl || data?.payfastUrl;
    const fields = data?.checkout?.fields || data?.fields;
    const fieldOrder = data?.checkout?.fieldOrder || data?.fieldOrder;
    if (!checkoutUrl || !fields?.signature) {
      throw new SubscriptionCheckoutError(USER_RETRY_MESSAGE, {
        code: "INVALID_CHECKOUT_RESPONSE",
        status: 502,
      });
    }

    logSubscription(requestId, "PayFast checkout generated", {
      host: (() => {
        try {
          return new URL(checkoutUrl).host;
        } catch {
          return "invalid";
        }
      })(),
    });

    rememberPendingSubscription(data.subscriptionId, slug);
    submitPayfastCheckoutForm(checkoutUrl, fields, fieldOrder, { requestId });
    redirected = true;
    return { ...data, redirected: true, requestId };
  } catch (err) {
    if (err?.code === "PAYFAST_REDIRECT_FAILED") {
      logSubscription(requestId, "Checkout handoff failed");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (!redirected) checkoutInFlight = false;
  }
}

/**
 * GET /api/subscriptions/current — display-only. Never mutates subscription status.
 */
export async function fetchSubscriptionCurrent() {
  const session = await getStableSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error("Please sign in.");

  const response = await fetch(`${getApiBase()}/api/subscriptions/current`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const payload = await readJsonSafe(response);
    throw checkoutErrorFromHttp(response.status, payload);
  }

  return response.json();
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
    const payload = await readJsonSafe(response);
    throw checkoutErrorFromHttp(response.status, payload);
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
