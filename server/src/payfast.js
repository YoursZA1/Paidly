import crypto from "crypto";

const serializeParams = (params) => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  return entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
};

export const signPayfastPayload = (params, passphrase) => {
  const baseString = serializeParams(params);
  const signatureString = passphrase
    ? `${baseString}&passphrase=${encodeURIComponent(passphrase)}`
    : baseString;

  return crypto.createHash("md5").update(signatureString).digest("hex");
};

export const verifyPayfastSignature = (payload, passphrase) => {
  if (!payload?.signature) return false;
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
