const STORAGE_KEY = "paidly_auth_refresh_telemetry_v1";
const MAX_RECENT_EVENTS = 20;

function nowIso() {
  return new Date().toISOString();
}

function safeRead() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite(state) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore telemetry persistence failures.
  }
}

let telemetryState = safeRead() || {
  successCount: 0,
  failureCount: 0,
  fatalCount: 0,
  lastOutcome: "none",
  lastUpdatedAt: null,
  recentEvents: [],
};

function record(outcome, metadata = {}) {
  if (outcome === "success") telemetryState.successCount += 1;
  if (outcome === "failure") telemetryState.failureCount += 1;
  if (outcome === "fatal") telemetryState.fatalCount += 1;
  telemetryState.lastOutcome = outcome;
  telemetryState.lastUpdatedAt = nowIso();
  telemetryState.recentEvents = [
    {
      at: telemetryState.lastUpdatedAt,
      outcome,
      source: String(metadata.source || "unknown"),
      reason: metadata.reason ? String(metadata.reason) : null,
    },
    ...(telemetryState.recentEvents || []),
  ].slice(0, MAX_RECENT_EVENTS);
  safeWrite(telemetryState);
}

export function recordAuthRefreshSuccess(metadata) {
  record("success", metadata);
}

export function recordAuthRefreshFailure(metadata) {
  record("failure", metadata);
}

export function recordAuthRefreshFatal(metadata) {
  record("fatal", metadata);
}

export function getAuthRefreshTelemetrySnapshot() {
  return {
    ...telemetryState,
    recentEvents: [...(telemetryState.recentEvents || [])],
  };
}

if (typeof window !== "undefined") {
  window.__paidlyAuthRefreshTelemetry = {
    getSnapshot: getAuthRefreshTelemetrySnapshot,
    clear() {
      telemetryState = {
        successCount: 0,
        failureCount: 0,
        fatalCount: 0,
        lastOutcome: "none",
        lastUpdatedAt: null,
        recentEvents: [],
      };
      safeWrite(telemetryState);
      return getAuthRefreshTelemetrySnapshot();
    },
  };
}

