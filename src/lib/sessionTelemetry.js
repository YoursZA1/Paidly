const SESSION_TELEMETRY_EVENT = "paidly:session-telemetry";
const counters = new Map();

function inc(name) {
  const next = (counters.get(name) || 0) + 1;
  counters.set(name, next);
  return next;
}

export function trackSessionTelemetry(eventName, payload = {}) {
  const event = String(eventName || "").trim();
  if (!event) return;
  const ts = Date.now();
  const count = inc(event);
  const body = { event, ts, count, ...payload };

  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(SESSION_TELEMETRY_EVENT, { detail: body }));
    } catch {
      // ignore event bus failures
    }
  }

  if (import.meta.env?.DEV) {
    // Lightweight dev visibility without requiring vendor analytics wiring.
    console.debug("[SessionTelemetry]", body);
  }
}

export function getSessionTelemetryCounters() {
  return Object.fromEntries(counters.entries());
}

export { SESSION_TELEMETRY_EVENT };
