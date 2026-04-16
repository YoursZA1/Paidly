import { createHash } from "node:crypto";

/**
 * PayFast signing string must not include undefined/null values (avoids "undefined" in URLs / runtime errors).
 */
function omitUndefinedAndNull(input) {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== undefined && v !== null)
  );
}

const serializeParams = (params) => {
  const safe = omitUndefinedAndNull(params);
  const entries = Object.entries(safe)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
};

export const signPayfastPayload = (params, passphrase) => {
  const data = omitUndefinedAndNull(params);
  const baseString = serializeParams(data);
  const signatureString = passphrase
    ? `${baseString}&passphrase=${encodeURIComponent(String(passphrase))}`
    : baseString;

  return createHash("md5").update(signatureString).digest("hex");
};

export const verifyPayfastSignature = (payload, passphrase) => {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (!payload.signature) return false;
  const { signature, ...rest } = payload;
  const expected = signPayfastPayload(rest, passphrase);
  return signature === expected;
};

export function isPayfastPassphraseSet() {
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
 * Live checkout signing: passphrase must match PayFast dashboard unless you explicitly allow unsigned (dashboard has no passphrase).
 * Set PAYFAST_LIVE_ALLOW_UNSIGNED_CHECKOUT=true only when your PayFast merchant profile has no security passphrase.
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
  const passphrase = String(process.env.PAYFAST_PASSPHRASE ?? "").trim();

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

/**
 * Log PayFast field map before signing. Confirms `merchant_id` / `merchant_key` in logs.
 * `merchant_key` is redacted unless `PAYFAST_LOG_FULL_MERCHANT_KEY=true` (avoid leaking secrets in Vercel logs).
 * @param {Record<string, unknown>} payload
 */
export function logPayfastPayloadDebug(payload) {
  if (payload == null || typeof payload !== "object") return;
  const data = { ...payload };
  const full =
    String(process.env.PAYFAST_LOG_FULL_MERCHANT_KEY || "").trim().toLowerCase() === "true" ||
    process.env.PAYFAST_LOG_FULL_MERCHANT_KEY === "1";
  const logPayload = full
    ? data
    : {
        ...data,
        merchant_key: data.merchant_key
          ? `[present, ${String(data.merchant_key).length} chars]`
          : "[MISSING]",
      };
  console.log("PAYFAST DATA:", logPayload);
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
