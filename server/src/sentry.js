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

export { Sentry };
