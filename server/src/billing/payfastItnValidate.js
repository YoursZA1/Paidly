import dns from "node:dns/promises";
import {
  getPayfastMerchantCredentialsForMode,
  payfastMode,
  verifyPayfastSignature,
} from "../payfast.js";

/** PayFast validate endpoints (server-to-server). */
export function getPayfastValidateUrl(mode = payfastMode()) {
  const m = String(mode || "sandbox").toLowerCase();
  if (m === "live") {
    const override = String(process.env.PAYFAST_LIVE_VALIDATE_URL || "").trim();
    return override || "https://www.payfast.co.za/eng/query/validate";
  }
  const override = String(process.env.PAYFAST_SANDBOX_VALIDATE_URL || "").trim();
  return override || "https://sandbox.payfast.co.za/eng/query/validate";
}

/** Hosts used to refresh recommended ITN source IPs via DNS. */
const PAYFAST_ITN_DNS_HOSTS = [
  "www.payfast.co.za",
  "sandbox.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
];

/** Documented / commonly published PayFast notify ranges (augmented by DNS). */
const PAYFAST_ITN_STATIC_IPS = [
  "144.126.193.139",
  "34.107.176.71",
  "34.120.184.229",
];

const PAYFAST_ITN_CIDRS = [
  "197.97.145.144/28",
  "41.74.179.192/27",
  "102.216.36.0/28",
  "102.216.36.128/28",
];

function ipToInt(ip) {
  const parts = String(ip || "").split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function ipv4InCidr(ip, cidr) {
  const [base, bitsRaw] = String(cidr).split("/");
  const bits = Number(bitsRaw);
  const ipN = ipToInt(ip);
  const baseN = ipToInt(base);
  if (ipN == null || baseN == null || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

function parseCsvIps(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Recommended IP allow-list: env whitelist → else DNS + static CIDRs.
 * Skip when PAYFAST_ITN_SKIP_IP_CHECK=true (e.g. Cloudflare without real client IP).
 */
export async function resolvePayfastItnAllowedIps() {
  const fromEnv = parseCsvIps(process.env.PAYFAST_ITN_IP_WHITELIST);
  if (fromEnv.length) return fromEnv;

  const resolved = new Set(PAYFAST_ITN_STATIC_IPS);
  await Promise.all(
    PAYFAST_ITN_DNS_HOSTS.map(async (host) => {
      try {
        const addrs = await dns.resolve4(host);
        for (const a of addrs || []) resolved.add(a);
      } catch {
        /* DNS optional */
      }
    })
  );
  return [...resolved];
}

/**
 * @param {string} ip
 * @param {string[]} allowedExact
 */
export function isPayfastItnIpAllowed(ip, allowedExact) {
  const client = String(ip || "").trim();
  if (!client) return false;
  if ((allowedExact || []).includes(client)) return true;
  for (const cidr of PAYFAST_ITN_CIDRS) {
    if (ipv4InCidr(client, cidr)) return true;
  }
  return false;
}

export function shouldEnforcePayfastItnIp() {
  const skip = String(process.env.PAYFAST_ITN_SKIP_IP_CHECK || "").toLowerCase();
  if (skip === "true" || skip === "1" || skip === "yes") return false;
  // Recommended in production/live; sandbox can be looser unless PAYFAST_ITN_REQUIRE_IP=true
  const require = String(process.env.PAYFAST_ITN_REQUIRE_IP || "").toLowerCase();
  if (require === "true" || require === "1" || require === "yes") return true;
  if (require === "false" || require === "0" || require === "no") return false;
  return payfastMode() === "live" || process.env.NODE_ENV === "production";
}

/**
 * Verify local signature (passphrase).
 */
export function checkPayfastItnSignature(payload, passphrase) {
  return Boolean(verifyPayfastSignature(payload, passphrase || ""));
}

/**
 * POST the ITN body back to PayFast; expect VALID.
 * @param {Record<string, unknown>} payload
 */
export async function postBackPayfastValidate(payload, mode = payfastMode()) {
  const url = getPayfastValidateUrl(mode);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(payload || {})) {
    if (v == null) continue;
    body.append(String(k), String(v));
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const text = String(await res.text()).trim();
    const valid = /^VALID/i.test(text);
    return { ok: valid, responseText: text, httpStatus: res.status, url };
  } catch (e) {
    return {
      ok: false,
      responseText: String(e?.message || e),
      httpStatus: 0,
      url,
      error: e,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Merchant id on ITN must match configured merchant for mode.
 */
export function checkPayfastMerchantId(payload, mode = payfastMode()) {
  const expected = getPayfastMerchantCredentialsForMode(mode).merchantId;
  const got = String(payload?.merchant_id || "").trim();
  if (!expected) {
    return { ok: false, error: "Merchant credentials not configured on server" };
  }
  if (!got) return { ok: false, error: "ITN missing merchant_id" };
  if (got !== expected) {
    return { ok: false, error: `merchant_id mismatch (got ${got})` };
  }
  return { ok: true, merchantId: got };
}

/**
 * Compare ITN amount to expected (subscription / plan).
 */
export function checkPayfastAmount(payload, expectedAmount) {
  const gross = Number(payload?.amount_gross ?? payload?.amount ?? payload?.recurring_amount);
  const expected = Number(expectedAmount);
  if (!Number.isFinite(gross) || gross < 0) {
    return { ok: false, error: "ITN amount missing or invalid", gross, expected };
  }
  if (!Number.isFinite(expected) || expected <= 0) {
    return { ok: false, error: "Expected subscription amount missing", gross, expected };
  }
  // Allow 1 cent float noise
  if (Math.abs(gross - expected) > 0.009) {
    return { ok: false, error: `amount mismatch: got ${gross}, expected ${expected}`, gross, expected };
  }
  return { ok: true, gross, expected };
}

/**
 * Currency must match subscription / plan (Paidly SaaS is ZAR).
 * PayFast may omit currency on some ITNs — then require expected ZAR and accept missing as ZAR.
 */
export function checkPayfastCurrency(payload, expectedCurrency = "ZAR") {
  const expected = String(expectedCurrency || "ZAR").trim().toUpperCase() || "ZAR";
  const raw = payload?.custom_str4 ?? payload?.currency ?? payload?.currency_code ?? "";
  const got = String(raw || "").trim().toUpperCase();
  if (!got) {
    // Many PayFast recurring ITNs omit currency; treat as expected when catalog is ZAR.
    if (expected === "ZAR") return { ok: true, currency: "ZAR", inferred: true };
    return { ok: false, error: `ITN missing currency (expected ${expected})`, got: null, expected };
  }
  if (got !== expected) {
    return { ok: false, error: `currency mismatch: got ${got}, expected ${expected}`, got, expected };
  }
  return { ok: true, currency: got, inferred: false };
}
