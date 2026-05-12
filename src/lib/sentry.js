import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    // Suppress noisy non-bugs
    ignoreErrors: [
      /ResizeObserver loop/,
      /ChunkLoadError/,
      /AbortError/,
      /dynamically imported module/,
      /Loading chunk/,
    ],
    beforeSend(event) {
      // Only send in production unless forced (e.g. VITE_SENTRY_FORCE_ENABLE=true for staging)
      if (
        import.meta.env.MODE !== "production" &&
        !import.meta.env.VITE_SENTRY_FORCE_ENABLE
      ) {
        return null;
      }
      return event;
    },
  });
}

export function captureException(error, context) {
  if (!dsn) return;
  if (!(error instanceof Error)) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext("context", context);
    Sentry.captureException(error);
  });
}

export function captureMessage(message, level = "info") {
  if (!dsn) return;
  Sentry.captureMessage(message, level);
}

export function setSentryUser(user) {
  if (!dsn) return;
  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

export { Sentry };
