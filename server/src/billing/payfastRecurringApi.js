import { createHash } from "node:crypto";
import {
  getPayfastMerchantCredentialsForMode,
  payfastMode,
} from "../payfast.js";

/**
 * PayFast Recurring Billing — Subscriptions API client.
 * https://developers.payfast.co.za/api#recurring-billing
 *
 *   GET   /subscriptions/:token/fetch
 *   PUT   /subscriptions/:token/pause     { cycles? }
 *   PUT   /subscriptions/:token/unpause
 *   PUT   /subscriptions/:token/cancel
 *   PATCH /subscriptions/:token/update    { amount (cents), frequency, cycles, run_date }
 *
 * Sandbox uses the same host with `?testing=true`. Headers: merchant-id, version,
 * timestamp, signature. The API signature is alphabetical over header + body +
 * query values plus the passphrase — NOT the checkout form (document-order) signature —
 * and excludes the `testing` flag.
 */

const API_BASE = "https://api.payfast.co.za";
const API_VERSION = "v1";

/** PayFast `frequency` codes (checkout form + update API). */
export const PAYFAST_FREQUENCY = Object.freeze({
  daily: 1,
  weekly: 2,
  monthly: 3,
  quarterly: 4,
  biannual: 5,
  annual: 6,
});

/**
 * GET /fetch returns `status` (1 = ACTIVE is the only documented code) plus
 * `status_text`; Paidly relies on status_text for everything else.
 */
export const PAYFAST_SUBSCRIPTION_STATUS = Object.freeze({ 1: "ACTIVE" });

function phpUrlEncode(v) {
  return encodeURIComponent(String(v))
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * PayFast API signature (alphabetical keys — different from checkout form signature).
 * `testing` is never part of the signature (sandbox flag only).
 * @param {Record<string, string|number|boolean>} data header + body + query values
 * @param {string} passphrase
 */
export function generatePayfastApiSignature(data, passphrase) {
  const merged = { ...(data || {}) };
  if (passphrase && String(passphrase).trim() !== "") {
    merged.passphrase = String(passphrase).trim();
  }
  const paramString = Object.entries(merged)
    .filter(([k, v]) => k !== "signature" && k !== "testing" && v != null && String(v) !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${phpUrlEncode(v)}`)
    .join("&");
  return createHash("md5").update(paramString).digest("hex");
}

/**
 * ISO-8601 timestamp for API headers: YYYY-MM-DDTHH:MM:SS+HH:MM (explicit offset,
 * so the value is correct regardless of the server's timezone).
 */
export function payfastApiTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Rand amount → integer cents (the update/adhoc APIs take cents). */
export function randsToCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * Hosted page where the buyer updates the card on their recurring agreement.
 * @param {string} token
 * @param {string} [returnUrl]
 * @param {string} [mode]
 */
export function payfastUpdateCardUrl(token, returnUrl = "", mode = payfastMode()) {
  const tok = String(token || "").trim();
  if (!tok) return null;
  const host = mode === "live" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";
  const url = new URL(`${host}/eng/recurring/update/${encodeURIComponent(tok)}`);
  if (returnUrl) url.searchParams.set("return", returnUrl);
  return url.toString();
}

/**
 * Low-level signed call to the Subscriptions API.
 * @param {string} token
 * @param {"fetch"|"pause"|"unpause"|"cancel"|"update"} action
 * @param {{ method?: string, body?: Record<string, unknown>, fetchImpl?: typeof fetch, now?: Date }} [opts]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, status?: number, body?: any, data?: any, error?: string }>}
 */
export async function payfastSubscriptionRequest(token, action, opts = {}) {
  const tok = String(token || "").trim();
  if (!tok) return { ok: true, skipped: true, reason: "no_token" };

  const mode = payfastMode();
  const { merchantId, passphrase } = getPayfastMerchantCredentialsForMode(mode);
  if (!merchantId) return { ok: false, error: "PayFast merchant_id not configured" };
  if (!String(passphrase || "").trim()) {
    return { ok: false, error: "PAYFAST_PASSPHRASE is required for the PayFast Subscriptions API" };
  }

  const method = opts.method || (action === "fetch" ? "GET" : action === "update" ? "PATCH" : "PUT");
  const body = {};
  for (const [k, v] of Object.entries(opts.body || {})) {
    if (v != null && String(v) !== "") body[k] = v;
  }
  const headersBase = { "merchant-id": merchantId, version: API_VERSION, timestamp: payfastApiTimestamp(opts.now) };
  const signature = generatePayfastApiSignature({ ...headersBase, ...body }, passphrase);

  const url = new URL(`${API_BASE}/subscriptions/${encodeURIComponent(tok)}/${action}`);
  if (mode !== "live") url.searchParams.set("testing", "true");

  const doFetch = opts.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await doFetch(url.toString(), {
      method,
      headers: { ...headersBase, signature, "Content-Type": "application/json" },
      body: method === "GET" || !Object.keys(body).length ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* keep text */
    }
    const data = parsed && typeof parsed === "object" ? parsed.data : null;
    // PayFast returns HTTP 200 with data.response === false for refused actions.
    const refused = data && data.response === false;
    if (!res.ok || refused) {
      const message =
        (data && typeof data.message === "string" && data.message) ||
        (parsed && typeof parsed === "object" && typeof parsed.status === "string" ? parsed.status : null) ||
        `PayFast ${action} HTTP ${res.status}`;
      console.error(`[payfast-recurring] ${action} failed`, res.status, parsed);
      return { ok: false, status: res.status, body: parsed, data, error: message };
    }
    return { ok: true, status: res.status, body: parsed, data };
  } catch (e) {
    console.error(`[payfast-recurring] ${action} exception`, e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalised GET /fetch result.
 * @param {string} token
 */
export async function fetchPayfastSubscription(token, opts = {}) {
  const res = await payfastSubscriptionRequest(token, "fetch", opts);
  if (!res.ok || res.skipped) return res;
  const r = res.data?.response && typeof res.data.response === "object" ? res.data.response : {};
  const statusCode = Number(r.status);
  const statusText = String(r.status_text || PAYFAST_SUBSCRIPTION_STATUS[statusCode] || "").toUpperCase() || null;
  return {
    ...res,
    subscription: {
      token: r.token || token,
      status: Number.isFinite(statusCode) ? statusCode : null,
      status_text: statusText,
      status_reason: r.status_reason || null,
      amount_cents: r.amount != null ? Number(r.amount) : null,
      amount: r.amount != null ? Number(r.amount) / 100 : null,
      frequency: r.frequency != null ? Number(r.frequency) : null,
      cycles: r.cycles != null ? Number(r.cycles) : null,
      cycles_complete: r.cycles_complete != null ? Number(r.cycles_complete) : null,
      run_date: r.run_date ? String(r.run_date).slice(0, 10) : null,
      active: statusText === "ACTIVE",
    },
  };
}

/**
 * PATCH /update — change amount (Rands in, cents on the wire) / frequency / run_date on the
 * existing agreement. The buyer keeps the same card and token; no new checkout.
 * @param {string} token
 * @param {{ amount?: number, frequency?: number, cycles?: number, runDate?: string }} change
 */
export async function updatePayfastSubscription(token, change = {}, opts = {}) {
  const body = {};
  if (change.amount != null) body.amount = randsToCents(change.amount);
  if (change.frequency != null) body.frequency = Number(change.frequency);
  if (change.cycles != null) body.cycles = Number(change.cycles);
  if (change.runDate) body.run_date = String(change.runDate).slice(0, 10);
  if (!Object.keys(body).length) return { ok: false, error: "Nothing to update" };
  return payfastSubscriptionRequest(token, "update", { ...opts, body });
}

/** PUT /pause — skip `cycles` billing periods (default 1). */
export function pausePayfastSubscription(token, cycles = 1, opts = {}) {
  return payfastSubscriptionRequest(token, "pause", { ...opts, body: { cycles: Math.max(1, Number(cycles) || 1) } });
}

/** PUT /unpause */
export function unpausePayfastSubscription(token, opts = {}) {
  return payfastSubscriptionRequest(token, "unpause", opts);
}

/**
 * Cancel a PayFast recurring subscription / tokenization agreement.
 * PUT https://api.payfast.co.za/subscriptions/{token}/cancel[?testing=true]
 * @param {string} token — payfast_token / subscription token from ITN
 */
export function cancelPayfastRecurringBilling(token, opts = {}) {
  return payfastSubscriptionRequest(token, "cancel", opts);
}
