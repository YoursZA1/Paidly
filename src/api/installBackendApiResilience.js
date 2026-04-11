import { toast } from "sonner";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HTTP statuses worth retrying (cold serverless, rate limits, upstream blips). */
const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504]);

const MAX_RETRIES_GET = 2;
const MAX_RETRIES_MUTATION_NETWORK = 1;

function methodUpper(config) {
  return String(config?.method || "get").toUpperCase();
}

function isIdempotentMethod(config) {
  const m = methodUpper(config);
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isRetryableStatus(status) {
  return typeof status === "number" && RETRYABLE_STATUS.has(status);
}

function isNetworkOrTimeoutError(error) {
  if (!error) return false;
  if (error.code === "ECONNABORTED") return true;
  if (error.code === "ERR_NETWORK") return true;
  if (!error.response && error.request) return true;
  const msg = String(error.message || "").toLowerCase();
  return msg.includes("network error") || msg.includes("timeout");
}

function backoffMs(attempt) {
  return Math.min(2500, 400 * 2 ** attempt);
}

function shouldRetry(config, error) {
  const count = config.__paidlyRetryCount ?? 0;
  const status = error.response?.status;
  const network = isNetworkOrTimeoutError(error);
  const statusRetry = status != null && isRetryableStatus(status);
  const worthRetry = network || statusRetry;
  if (!worthRetry) return false;

  if (isIdempotentMethod(config)) {
    return count < MAX_RETRIES_GET;
  }
  return count < MAX_RETRIES_MUTATION_NETWORK;
}

function userFacingMessage(error) {
  const data = error.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data === "object" && data != null) {
    const v = data.error || data.message || data.detail;
    if (v) return String(v);
  }
  if (error.message) return error.message;
  return "Request failed. Check your connection and try again.";
}

function maybeToastFinalFailure(error) {
  const cfg = error.config;
  if (!cfg || cfg.__paidlySilent) return;
  const status = error.response?.status;
  if (status === 401 || status === 403) return;
  if (status === 404 && cfg.__paidlySilent404) return;

  const key = `paidly-api-${methodUpper(cfg)}-${String(cfg.url || "")}-${status ?? "net"}`;
  toast.error("Could not complete request", {
    description: userFacingMessage(error).slice(0, 220),
    duration: 6000,
    id: key.slice(0, 100),
  });
}

/**
 * Retries transient failures on the shared Axios instance; surfaces one Sonner toast per failing request shape.
 * GET/HEAD: up to 2 retries on network/timeout or 408/429/5xx. Mutations: 1 retry on the same (duplicate POST on 503 is rare).
 */
export function installBackendApiResilience(api) {
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const config = error.config;
      if (!config || !shouldRetry(config, error)) {
        maybeToastFinalFailure(error);
        return Promise.reject(error);
      }

      config.__paidlyRetryCount = (config.__paidlyRetryCount ?? 0) + 1;
      await sleep(backoffMs(config.__paidlyRetryCount - 1));

      return api.request(config);
    }
  );
}
