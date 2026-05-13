/**
 * Client-side exchange rate fetching: circuit breaker, optional env disable, local cache,
 * **12-hour** successful-refresh throttle, **per-base in-flight dedupe**, and **5xx / network cooldown**
 * (5 minutes) so `/api/exchange-rates` is not hammered on repeated failures or screen mounts.
 *
 * Storage: one `localStorage` entry per base, e.g. `exchange_rates_ZAR` → `{ v, savedAt, data }`.
 * Legacy `paidly_exchange_rates_cache_v1` is still read once for migration.
 */
import { backendApi } from "@/api/backendClient";

const CACHE_STORAGE_KEY = "paidly_exchange_rates_cache_v1";
const CIRCUIT_SESSION_KEY = "paidly_exchange_rates_circuit";
/** After a missing-route failure, skip network probes until this elapses (then retry once per expiry). */
const CIRCUIT_BLOCK_MS = 15 * 60 * 1000;

/** Minimum time between successful network refreshes per base; within this window only cache is used (no API). */
export const EXCHANGE_RATES_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/** In-flight network fetches per base (dedupe concurrent callers + background refresh). */
const inflightByBase = new Map();

/** After 5xx (or network) failures, skip new probes for this window to avoid log/request storms. */
const SERVER_ERROR_COOLDOWN_MS = 5 * 60 * 1000;
const serverErrorCooldownUntilByBase = new Map();

function isInServerErrorCooldown(base) {
  const until = Number(serverErrorCooldownUntilByBase.get(base) || 0);
  return Number.isFinite(until) && Date.now() < until;
}

function noteServerErrorCooldown(base) {
  serverErrorCooldownUntilByBase.set(base, Date.now() + SERVER_ERROR_COOLDOWN_MS);
}

function viteTruthy(name) {
  const v = String(import.meta.env?.[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When true, never calls the network for latest rates; uses cache only. */
export function isExchangeRatesSyncDisabled() {
  return viteTruthy("VITE_DISABLE_EXCHANGE_RATES_SYNC");
}

function parseCircuitExpiryMs() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(CIRCUIT_SESSION_KEY);
    if (raw == null || raw === "") return null;
    if (raw === "1") {
      const until = Date.now() + CIRCUIT_BLOCK_MS;
      sessionStorage.setItem(CIRCUIT_SESSION_KEY, String(until));
      return until;
    }
    const until = Number(raw);
    if (!Number.isFinite(until)) {
      sessionStorage.removeItem(CIRCUIT_SESSION_KEY);
      return null;
    }
    if (Date.now() >= until) {
      sessionStorage.removeItem(CIRCUIT_SESSION_KEY);
      return null;
    }
    return until;
  } catch {
    return null;
  }
}

/** True while we intentionally avoid hitting `/api/exchange-rates` after a terminal failure. */
export function readExchangeRatesCircuitOpen() {
  return parseCircuitExpiryMs() != null;
}

function setExchangeRatesCircuitOpen(open) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (!open) {
      sessionStorage.removeItem(CIRCUIT_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(CIRCUIT_SESSION_KEY, String(Date.now() + CIRCUIT_BLOCK_MS));
  } catch {
    /* ignore */
  }
}

export function markExchangeRatesTerminalFailure(status) {
  const n = Number(status || 0);
  if (n === 404 || n === 405 || n === 501) {
    setExchangeRatesCircuitOpen(true);
  }
}

function perBaseStorageKey(base) {
  return `exchange_rates_${base}`;
}

function readCacheRoot() {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCacheRoot(root) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
}

function isUsableExchangePayload(data) {
  if (!data || typeof data !== "object") return false;
  const rates = data.rates;
  if (rates && typeof rates === "object" && !Array.isArray(rates)) {
    for (const v of Object.values(rates)) {
      if (Number.isFinite(Number(v)) && Number(v) > 0) return true;
    }
  }
  const map = normalizeRatesMapFromApiPayload(data);
  return Object.keys(map).length > 0;
}

/**
 * @param {string} base — normalized ISO code
 * @returns {{ savedAt: number, data: object } | null}
 */
function readCachedExchangeEntry(base) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(perBaseStorageKey(base));
    if (raw) {
      const parsed = JSON.parse(raw);
      const data = parsed?.data;
      const savedAt = Number(parsed?.savedAt);
      if (data && typeof data === "object" && Number.isFinite(savedAt) && isUsableExchangePayload(data)) {
        return { savedAt, data };
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const root = readCacheRoot();
  const entry = root?.byBase?.[base];
  if (!entry || typeof entry !== "object") return null;
  const data = entry.data;
  const savedAt = Number(entry.savedAt);
  if (!data || typeof data !== "object" || !Number.isFinite(savedAt) || !isUsableExchangePayload(data)) return null;
  persistCachedExchangePayload(base, data, savedAt);
  return { savedAt, data };
}

/**
 * @param {string} base
 * @param {object} data
 * @param {number} [savedAt] — for migration only; default `Date.now()`
 */
function persistCachedExchangePayload(base, data, savedAt = Date.now()) {
  if (!data || typeof data !== "object" || !isUsableExchangePayload(data)) return;
  const at = Number.isFinite(savedAt) ? savedAt : Date.now();
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(perBaseStorageKey(base), JSON.stringify({ v: 1, savedAt: at, data }));
    }
  } catch {
    /* ignore */
  }
  const root = readCacheRoot() || { v: 1, byBase: {} };
  if (!root.byBase || typeof root.byBase !== "object") root.byBase = {};
  root.byBase[base] = { savedAt: at, data };
  writeCacheRoot(root);
}

export function readCachedExchangePayload(baseCurrency) {
  const base = normalizeBaseCurrency(baseCurrency);
  const entry = readCachedExchangeEntry(base);
  return entry?.data ?? null;
}

export function writeCachedExchangePayload(baseCurrency, data) {
  const base = normalizeBaseCurrency(baseCurrency);
  persistCachedExchangePayload(base, data, Date.now());
}

export function normalizeRatesMapFromApiPayload(data) {
  if (!data || typeof data !== "object") return {};
  const rates = data.rates;
  if (rates && typeof rates === "object" && !Array.isArray(rates)) {
    const out = {};
    for (const [k, v] of Object.entries(rates)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[String(k).toUpperCase()] = n;
    }
    return out;
  }
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (["provider", "base", "date", "detail", "error", "requested_date", "historical", "note"].includes(k)) {
      continue;
    }
    const n = Number(v);
    if (Number.isFinite(n)) out[String(k).toUpperCase()] = n;
  }
  return out;
}

export function normalizeBaseCurrency(raw) {
  const c = String(raw || "ZAR")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : "ZAR";
}

async function fetchExchangeRatesFromNetwork(base) {
  const existing = inflightByBase.get(base);
  if (existing) return existing;

  const promise = (async () => {
    try {
      if (isInServerErrorCooldown(base)) {
        return readCachedExchangeEntry(base)?.data ?? null;
      }
      if (typeof backendApi.get !== "function") return null;
      const response = await backendApi.get("/api/exchange-rates", {
        params: { base },
        timeout: 5000,
        __paidlySilent: true,
      });
      const data = response?.data;
      if (data && typeof data === "object" && isUsableExchangePayload(data)) {
        persistCachedExchangePayload(base, data, Date.now());
        setExchangeRatesCircuitOpen(false);
        serverErrorCooldownUntilByBase.delete(base);
        return data;
      }
      return data && typeof data === "object" ? data : null;
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      markExchangeRatesTerminalFailure(status);
      if (status === 0 || (status >= 429 && status < 600)) {
        noteServerErrorCooldown(base);
      }
      if (import.meta.env?.DEV) {
        console.warn(
          "[exchange-rates] fetch failed; using cache if available.",
          status || error?.code || error?.message
        );
      }
      return null;
    } finally {
      inflightByBase.delete(base);
    }
  })();

  inflightByBase.set(base, promise);
  return promise;
}

/**
 * Latest rates payload: prefers cache; avoids API calls more often than {@link EXCHANGE_RATES_CACHE_TTL_MS}.
 * If cache is older than TTL, returns cache immediately and refreshes in the background (deduped).
 * @returns {Promise<object|null>} Provider-shaped object or null if nothing available
 */
export async function fetchLatestExchangeRatesPayload(baseCurrency = "ZAR") {
  const base = normalizeBaseCurrency(baseCurrency);

  if (isExchangeRatesSyncDisabled()) {
    return readCachedExchangePayload(base);
  }

  if (readExchangeRatesCircuitOpen()) {
    return readCachedExchangePayload(base);
  }

  if (typeof backendApi.get !== "function") {
    return readCachedExchangePayload(base);
  }

  const entry = readCachedExchangeEntry(base);
  const now = Date.now();
  const ageMs = entry ? now - entry.savedAt : Infinity;
  const hasCache = Boolean(entry?.data);
  const cacheStillFresh = hasCache && ageMs < EXCHANGE_RATES_CACHE_TTL_MS;

  if (cacheStillFresh) {
    return entry.data;
  }

  if (hasCache) {
    if (!isInServerErrorCooldown(base)) {
      void fetchExchangeRatesFromNetwork(base);
    }
    return entry.data;
  }

  if (!hasCache && isInServerErrorCooldown(base)) {
    return readCachedExchangePayload(base);
  }

  const fresh = await fetchExchangeRatesFromNetwork(base);
  if (fresh && typeof fresh === "object") return fresh;
  return readCachedExchangePayload(base);
}

export async function getExchangeRates(baseCurrency = "ZAR") {
  const payload = await fetchLatestExchangeRatesPayload(baseCurrency);
  return normalizeRatesMapFromApiPayload(payload || {});
}

function asPositiveNumber(raw, fallback = 0) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Multiplier: document currency amount × rate ≈ amount in org base currency.
 * Same semantics as legacy fetch to `/api/exchange-rates?base={docCurrency}` then `rates[baseCurrency]`.
 */
export async function getExchangeRateForDocument(documentCurrency, baseCurrency) {
  const from = normalizeBaseCurrency(documentCurrency);
  const to = normalizeBaseCurrency(baseCurrency);
  if (from === to) return 1;

  const payload = await fetchLatestExchangeRatesPayload(from);
  const rates = payload?.rates && typeof payload.rates === "object" ? payload.rates : null;
  const rate = rates ? asPositiveNumber(rates[to], 0) : 0;
  if (rate > 0) return rate;

  const map = normalizeRatesMapFromApiPayload(payload || {});
  return asPositiveNumber(map[to], 0);
}

export function __resetExchangeRatesClientPolicyForTests() {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(CIRCUIT_SESSION_KEY);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CACHE_STORAGE_KEY);
      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith("exchange_rates_")) localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
  inflightByBase.clear();
  serverErrorCooldownUntilByBase.clear();
}
