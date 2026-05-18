import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    integrations: [Sentry.expressIntegration()],
  });

  initialized = true;
}

export function captureServerException(error, context) {
  if (!initialized) return;
  if (!(error instanceof Error)) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext("context", context);
    Sentry.captureException(error);
  });
}

/**
 * Forward a structured security event to Sentry as a message.
 * No-ops when Sentry is not initialized (DSN not configured).
 *
 * @param {"warn"|"error"} level
 * @param {string} event
 * @param {Record<string, unknown>} data
 */
export function captureSecurityEvent(level, event, data = {}) {
  if (!initialized) return;
  const sentryLevel = level === "error" ? "error" : "warning";
  Sentry.withScope((scope) => {
    scope.setTag("security_event", event);
    scope.setLevel(sentryLevel);
    scope.setContext("security", data);
    Sentry.captureMessage(`security.${event}`, sentryLevel);
  });
}

export { Sentry };
