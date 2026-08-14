import {
  describePayfastCheckoutSignature,
  generatePayFastSignature,
  verifyPayFastITNSignature,
} from "./payfastCustomSignature.js";

export {
  PAYFAST_CHECKOUT_FIELD_ORDER,
  buildPayfastCheckoutParamString,
  describePayfastCheckoutSignature,
  generatePayFastSignature,
  orderPayfastCheckoutFields,
  payfastPhpUrlEncode,
  signPayfastCheckoutFields,
  verifyPayFastITNSignature,
} from "./payfastCustomSignature.js";

/**
 * Custom Integration checkout signature (document field order + PHP urlencode).
 * Prefer `generatePayFastSignature` in new code.
 */
export const signPayfastPayload = (params, passphrase) =>
  generatePayFastSignature(params, passphrase);

/**
 * Verify a PayFast **ITN** signature (received-field order, not checkout attribute order).
 */
export const verifyPayfastSignature = (payload, passphrase, opts) =>
  verifyPayFastITNSignature(payload, passphrase, opts);

export function isPayfastPassphraseSet() {
  const mode = payfastMode();
  const { passphrase } = getPayfastMerchantCredentialsForMode(mode);
  if (passphrase) return true;
  return String(process.env.PAYFAST_PASSPHRASE || "").trim().length > 0;
}

export function payfastMode() {
  return String(process.env.PAYFAST_MODE || "sandbox").toLowerCase();
}

export function payfastLiveMode() {
  return payfastMode() === "live";
}

/** Local sandbox only — never enable in production (ITN could be forged without a passphrase). */
export function payfastItnSkipsPassphraseRequirement() {
  return String(process.env.PAYFAST_ITN_ALLOW_NO_PASSPHRASE || "").toLowerCase() === "true";
}

export function payfastDeployedLikeProduction() {
  if (process.env.NODE_ENV === "production") return true;
  if (String(process.env.VERCEL_ENV || "").toLowerCase() === "production") return true;
  return false;
}

/** When true, ITN must use a non-empty PAYFAST_PASSPHRASE or we reject the webhook. */
export function payfastItnMustVerifyWithPassphrase() {
  if (payfastItnSkipsPassphraseRequirement()) return false;
  return payfastLiveMode() || payfastDeployedLikeProduction();
}

/**
 * Live one-off checkout signing: passphrase must match PayFast dashboard unless you explicitly allow unsigned.
 * Set PAYFAST_LIVE_ALLOW_UNSIGNED_CHECKOUT=true only when your PayFast merchant profile has no security passphrase.
 * Subscriptions always require a passphrase — use `assertPayfastPassphraseForSubscriptionCheckout`.
 */
export function assertPayfastPassphraseForLiveCheckout() {
  if (!payfastLiveMode()) return { ok: true };
  if (isPayfastPassphraseSet()) return { ok: true };
  if (String(process.env.PAYFAST_LIVE_ALLOW_UNSIGNED_CHECKOUT || "").toLowerCase() === "true") {
    console.warn(
      "[payfast] LIVE checkout: PAYFAST_PASSPHRASE empty — allowed via PAYFAST_LIVE_ALLOW_UNSIGNED_CHECKOUT=true (must match PayFast dashboard)"
    );
    return { ok: true };
  }
  return {
    ok: false,
    code: "PAYFAST_PASSPHRASE_REQUIRED",
    error:
      "Set PAYFAST_PASSPHRASE in your server env to match the PayFast security passphrase, or set PAYFAST_MODE=sandbox for testing. If your PayFast account has no passphrase, set PAYFAST_LIVE_ALLOW_UNSIGNED_CHECKOUT=true.",
  };
}

/**
 * Recurring Billing requires a salt passphrase in sandbox and live
 * (PayFast Custom Integration — Subscriptions).
 */
export function assertPayfastPassphraseForSubscriptionCheckout() {
  if (isPayfastPassphraseSet()) return { ok: true };
  return {
    ok: false,
    code: "PAYFAST_PASSPHRASE_REQUIRED",
    error:
      "PayFast subscriptions require PAYFAST_PASSPHRASE to match the merchant Salt Passphrase (sandbox: sandbox.payfast.co.za → Settings; live: merchant dashboard). Do not generate an unsigned subscription request.",
  };
}

export function assertPayfastPassphraseForItn() {
  if (!payfastItnMustVerifyWithPassphrase()) return { ok: true };
  if (isPayfastPassphraseSet()) return { ok: true };
  return {
    ok: false,
    error:
      "PAYFAST_PASSPHRASE is required to verify PayFast ITN in production/live. For local sandbox without a passphrase set PAYFAST_ITN_ALLOW_NO_PASSPHRASE=true (never in production).",
  };
}

/**
 * Live checkouts: return, cancel, and notify must be https (browser + PayFast expectations).
 * @param {Array<[string, string | undefined | null]>} entries
 */
export function assertPayfastHttpsUrlsInLive(entries) {
  if (!payfastLiveMode()) return { ok: true };
  for (const [name, url] of entries) {
    if (url == null || String(url).trim() === "") continue;
    try {
      if (new URL(String(url).trim()).protocol !== "https:") {
        return { ok: false, error: `${name} must use https:// when PAYFAST_MODE=live` };
      }
    } catch {
      return { ok: false, error: `Invalid ${name}` };
    }
  }
  return { ok: true };
}

/**
 * When the client supplies notify_url, it must match return_url origin so ITNs are not sent to a third-party host.
 */
export function assertPayfastClientNotifySameOrigin(notifyUrl, returnUrlFromClient) {
  if (!returnUrlFromClient || String(returnUrlFromClient).trim() === "") return { ok: true };
  if (!notifyUrl || String(notifyUrl).trim() === "") return { ok: true };
  try {
    const n = new URL(String(notifyUrl).trim());
    const r = new URL(String(returnUrlFromClient).trim());
    if (n.origin !== r.origin) {
      return { ok: false, error: "notify_url must share the same origin as return_url" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Invalid notify_url or return_url for origin check" };
  }
}

function hostnameIsLoopbackOrPrivate(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h === "0.0.0.0") {
    return true;
  }
  if (h.endsWith(".local") || h.endsWith(".localhost")) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

/**
 * PayFast cannot POST ITN to a private host. Live always rejects; sandbox rejects
 * unless PAYFAST_ALLOW_LOCALHOST_NOTIFY=true (still will not receive ITNs).
 */
export function assertPayfastNotifyUrlReachable(notifyUrl) {
  const raw = String(notifyUrl || "").trim();
  if (!raw) {
    return { ok: false, code: "PAYFAST_NOTIFY_URL_MISSING", error: "notify_url is required" };
  }
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, code: "PAYFAST_NOTIFY_URL_INVALID", error: "notify_url is not a valid URL" };
  }
  if (payfastLiveMode() && u.protocol !== "https:") {
    return { ok: false, error: "notify_url must use https:// when PAYFAST_MODE=live" };
  }
  if (!hostnameIsLoopbackOrPrivate(u.hostname)) return { ok: true };
  const allowLocal =
    String(process.env.PAYFAST_ALLOW_LOCALHOST_NOTIFY || "").trim().toLowerCase() === "true";
  if (!payfastLiveMode() && allowLocal) {
    console.warn(
      "[payfast] notify_url is localhost — PayFast cannot deliver ITNs. Set PAYFAST_SUBSCRIPTION_NOTIFY_URL to a public HTTPS URL."
    );
    return { ok: true, warning: "localhost_notify" };
  }
  return {
    ok: false,
    code: "PAYFAST_NOTIFY_URL_NOT_PUBLIC",
    error:
      "notify_url must be publicly reachable by PayFast (not localhost). Set PAYFAST_SUBSCRIPTION_NOTIFY_URL to your Vercel URL or a tunnel such as ngrok.",
  };
}

/**
 * Server-owned notify URL. Env wins over any client-supplied value.
 *
 * @param {{ clientNotifyUrl?: string|null, returnUrl?: string|null }} opts
 */
export function resolvePayfastSubscriptionNotifyUrl(opts = {}) {
  const fromEnv = String(
    process.env.PAYFAST_SUBSCRIPTION_NOTIFY_URL || process.env.PAYFAST_NOTIFY_URL || ""
  ).trim();
  if (fromEnv) {
    return { ok: true, notifyUrl: fromEnv, source: "env" };
  }

  const site = String(process.env.PAYFAST_PUBLIC_SITE_URL || process.env.VITE_PAYFAST_PUBLIC_SITE_URL || "").trim();
  if (site) {
    try {
      const origin = new URL(site).origin;
      return { ok: true, notifyUrl: `${origin}/api/payfast/itn`, source: "public_site" };
    } catch {
      return { ok: false, error: "PAYFAST_PUBLIC_SITE_URL is invalid" };
    }
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl && payfastDeployedLikeProduction()) {
    const host = vercelUrl.replace(/^https?:\/\//, "");
    return { ok: true, notifyUrl: `https://${host}/api/payfast/itn`, source: "vercel_url" };
  }

  const clientNotify = String(opts.clientNotifyUrl || "").trim();
  const returnUrl = String(opts.returnUrl || "").trim();
  if (clientNotify) {
    const originOk = assertPayfastClientNotifySameOrigin(clientNotify, returnUrl);
    if (!originOk.ok) return { ok: false, error: originOk.error };
    return { ok: true, notifyUrl: clientNotify, source: "client" };
  }

  if (returnUrl) {
    try {
      return {
        ok: true,
        notifyUrl: `${new URL(returnUrl).origin}/api/payfast/itn`,
        source: "return_origin",
      };
    } catch {
      /* fall through */
    }
  }

  return {
    ok: false,
    code: "PAYFAST_NOTIFY_URL_MISSING",
    error: "Could not determine notify_url. Set PAYFAST_SUBSCRIPTION_NOTIFY_URL.",
  };
}

export const getPayfastProcessUrl = (mode) => {
  if (mode === "live") {
    const override = String(process.env.PAYFAST_LIVE_PROCESS_URL || "").trim();
    if (override) return override.replace(/\/$/, "");
    return "https://www.payfast.co.za/eng/process";
  }
  return "https://sandbox.payfast.co.za/eng/process";
};

/**
 * Read PayFast merchant credentials from env (Vercel dashboard or .env).
 * Always returns trimmed strings — never `undefined` — so JSON responses always include keys.
 */
export function getPayfastMerchantCredentialsFromEnv() {
  const merchantId = String(process.env.PAYFAST_MERCHANT_ID ?? "").trim();
  const merchantKey = String(process.env.PAYFAST_MERCHANT_KEY ?? "").trim();
  const passphrase = String(process.env.PAYFAST_PASSPHRASE ?? "").trim();
  return { merchantId, merchantKey, passphrase };
}

/**
 * Mode-aware credentials to avoid sandbox/live mix-ups.
 *
 * Supported env (fallback order):
 * - sandbox: PAYFAST_SANDBOX_MERCHANT_ID / PAYFAST_SANDBOX_MERCHANT_KEY → PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY
 * - live: PAYFAST_LIVE_MERCHANT_ID / PAYFAST_LIVE_MERCHANT_KEY → PAYFAST_MERCHANT_ID / PAYFAST_MERCHANT_KEY
 */
export function getPayfastMerchantCredentialsForMode(mode) {
  const m = String(mode || payfastMode() || "sandbox").trim().toLowerCase();
  const sharedPass = String(process.env.PAYFAST_PASSPHRASE ?? "").trim();
  const modePass =
    m === "live"
      ? String(process.env.PAYFAST_LIVE_PASSPHRASE ?? "").trim()
      : String(process.env.PAYFAST_SANDBOX_PASSPHRASE ?? "").trim();
  const passphrase = modePass || sharedPass;

  const pick = (idKey, keyKey) => {
    const merchantId = String(process.env[idKey] ?? "").trim();
    const merchantKey = String(process.env[keyKey] ?? "").trim();
    return { merchantId, merchantKey };
  };

  const primary =
    m === "live"
      ? pick("PAYFAST_LIVE_MERCHANT_ID", "PAYFAST_LIVE_MERCHANT_KEY")
      : pick("PAYFAST_SANDBOX_MERCHANT_ID", "PAYFAST_SANDBOX_MERCHANT_KEY");
  const fallback = pick("PAYFAST_MERCHANT_ID", "PAYFAST_MERCHANT_KEY");

  return {
    merchantId: primary.merchantId || fallback.merchantId,
    merchantKey: primary.merchantKey || fallback.merchantKey,
    passphrase,
  };
}

export function isPayfastKnownSandboxMerchantId(merchantId) {
  const id = String(merchantId || "").trim();
  return id === "10000100" || id === "10005646";
}

function payfastSignatureDebugEnabled() {
  const v = String(process.env.PAYFAST_SIGNATURE_DEBUG || "").trim().toLowerCase();
  if (v !== "true" && v !== "1" && v !== "yes") return false;
  if (payfastLiveMode() || payfastDeployedLikeProduction()) return false;
  return true;
}

/**
 * Safe checkout log: identifiers only. Never logs passphrase or merchant_key.
 * Encoded param string (passphrase redacted) only when PAYFAST_SIGNATURE_DEBUG=true in sandbox.
 * @param {Record<string, unknown>} payload
 * @param {string} [passphrase]
 */
export function logPayfastPayloadDebug(payload, passphrase) {
  if (payload == null || typeof payload !== "object") return;
  const data = /** @type {Record<string, unknown>} */ ({ ...payload });
  const safe = {
    merchant_id: data.merchant_id || "[MISSING]",
    merchant_key: data.merchant_key ? "[present]" : "[MISSING]",
    m_payment_id: data.m_payment_id || null,
    amount: data.amount || null,
    item_name: data.item_name || null,
    subscription_type: data.subscription_type ?? null,
    frequency: data.frequency ?? null,
    cycles: data.cycles ?? null,
    notify_url: data.notify_url || null,
    signature: data.signature ? "[present]" : "[MISSING]",
    mode: payfastMode(),
  };
  console.log("[payfast] checkout fields", safe);
  if (payfastSignatureDebugEnabled()) {
    const diag = describePayfastCheckoutSignature(data, passphrase || "");
    console.log("[payfast] signature debug", {
      includedFields: diag.includedFields,
      paramStringRedacted: diag.paramStringRedacted,
      signature: diag.signature,
      passphraseAppended: diag.passphraseAppended,
    });
  }
}

export const getPayfastFrequency = (billingCycle) => {
  switch (billingCycle) {
    case "annual":
      return 6; // annually
    case "quarterly":
      return 4; // quarterly
    case "biannual":
      return 5; // biannual
    case "monthly":
    default:
      return 3; // monthly
  }
};
