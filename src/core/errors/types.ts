export type PaidlyErrorKind =
  | "auth"
  | "timeout"
  | "offline"
  | "rls"
  | "transport"
  | "stale_session"
  | "server"
  | "unknown";

export type RetryRecommendation = "immediate" | "backoff" | "never";

export type ParsedPaidlyError = {
  kind: PaidlyErrorKind;
  /** Human-safe message for UI */
  message: string;
  retry: RetryRecommendation;
  /** Non-PII metadata for logs / PostHog */
  telemetry: Record<string, string | number | boolean | null>;
};
