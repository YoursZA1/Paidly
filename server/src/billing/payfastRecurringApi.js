import { createHash } from "node:crypto";
import {
  getPayfastMerchantCredentialsForMode,
  payfastMode,
} from "../payfast.js";

/**
 * PayFast API signature (alphabetical keys — different from checkout form signature).
 * @param {Record<string, string|number|boolean>} data
 * @param {string} passphrase
 */
export function generatePayfastApiSignature(data, passphrase) {
  const entries = Object.entries(data || {})
    .filter(([k, v]) => k !== "signature" && v != null && String(v) !== "")
    .sort(([a], [b]) => a.localeCompare(b));

  const enc = (v) =>
    encodeURIComponent(String(v))
      .replace(/%20/g, "+")
      .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

  let paramString = entries.map(([k, v]) => `${k}=${enc(v)}`).join("&");
  if (passphrase && String(passphrase).trim() !== "") {
    paramString += `&passphrase=${enc(String(passphrase).trim())}`;
  }
  return createHash("md5").update(paramString).digest("hex");
}

/** PHP `date("Y-m-d\\TH:i:sO")` style timestamp for PayFast API headers. */
export function payfastApiTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad(Math.floor(abs / 60));
  const om = pad(abs % 60);
  return `${y}-${m}-${d}T${h}:${min}:${s}${sign}${oh}${om}`;
}

/**
 * Cancel a PayFast recurring subscription / tokenization agreement.
 * PUT https://api.payfast.co.za/subscriptions/{token}/cancel[?testing=true]
 *
 * @param {string} token — payfast_token / subscription token from ITN
 * @returns {Promise<{ ok: boolean, skipped?: boolean, status?: number, body?: unknown, error?: string }>}
 */
export async function cancelPayfastRecurringBilling(token) {
  const tok = String(token || "").trim();
  if (!tok) {
    return { ok: true, skipped: true, reason: "no_token" };
  }

  const mode = payfastMode();
  const { merchantId, passphrase } = getPayfastMerchantCredentialsForMode(mode);
  if (!merchantId) {
    return { ok: false, error: "PayFast merchant_id not configured" };
  }
  if (!String(passphrase || "").trim()) {
    return {
      ok: false,
      error: "PAYFAST_PASSPHRASE is required to cancel recurring billing via API",
    };
  }

  const timestamp = payfastApiTimestamp();
  const headersBase = {
    "merchant-id": merchantId,
    version: "v1",
    timestamp,
  };
  const testing = mode !== "live";
  const queryParams = testing ? { testing: "true" } : {};
  const signature = generatePayfastApiSignature(
    { ...headersBase, ...queryParams },
    passphrase
  );

  const url = new URL(`https://api.payfast.co.za/subscriptions/${encodeURIComponent(tok)}/cancel`);
  if (testing) url.searchParams.set("testing", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: {
        ...headersBase,
        signature,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const text = await res.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      /* keep text */
    }

    if (!res.ok) {
      console.error("[payfast-recurring] cancel failed", res.status, body);
      return {
        ok: false,
        status: res.status,
        body,
        error: typeof body === "object" && body?.message ? String(body.message) : `PayFast cancel HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, body };
  } catch (e) {
    console.error("[payfast-recurring] cancel exception", e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}
