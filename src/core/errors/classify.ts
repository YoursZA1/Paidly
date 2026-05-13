import type { ParsedPaidlyError, PaidlyErrorKind, RetryRecommendation } from "./types";

function str(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (typeof x === "object" && "message" in (x as object)) return String((x as { message?: unknown }).message ?? "");
  return String(x);
}

function code(x: unknown): string {
  if (x && typeof x === "object" && "code" in x) return String((x as { code?: unknown }).code ?? "");
  return "";
}

function status(x: unknown): number | null {
  if (!x || typeof x !== "object") return null;
  const o = x as { status?: unknown; statusCode?: unknown };
  const s = o.status ?? o.statusCode;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

function classifyFromMessage(msg: string): PaidlyErrorKind {
  const m = msg.toLowerCase();
  if (m.includes("network") || m.includes("failed to fetch")) return "transport";
  if (m.includes("timeout") || m.includes("timed out")) return "timeout";
  if (m.includes("offline") || m.includes("navigator")) return "offline";
  if (m.includes("jwt") || m.includes("session")) return "stale_session";
  return "unknown";
}

function retryFor(kind: PaidlyErrorKind): RetryRecommendation {
  if (kind === "auth" || kind === "rls" || kind === "stale_session") return "never";
  if (kind === "offline") return "backoff";
  if (kind === "timeout" || kind === "transport" || kind === "server") return "backoff";
  return "immediate";
}

/**
 * Unified classifier for Axios / fetch / Supabase errors.
 */
export function classifyPaidlyError(error: unknown): ParsedPaidlyError {
  const message = str(error);
  const http = status(error);
  const c = code(error);

  let kind: PaidlyErrorKind = "unknown";
  if (http === 401) kind = "auth";
  else if (http === 403 || c === "42501" || c === "PGRST301") kind = "rls";
  else if (http === 408 || http === 504) kind = "timeout";
  else if (http === 502 || http === 503) kind = "server";
  else if (http === 429) kind = "server";
  else kind = classifyFromMessage(message);

  return {
    kind,
    message: message || "Something went wrong",
    retry: retryFor(kind),
    telemetry: {
      kind,
      http: http ?? null,
      code: c || null,
    },
  };
}
