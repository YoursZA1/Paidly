/**
 * Demo Mode API client: /api/auth/demo (start), /demo-reset, /demo-end — all served by the existing
 * auth serverless function. The browser sends no ids: the server derives the demo user from the
 * verified bearer token.
 */
import { getBackendBaseUrl } from "@/api/backendClient";
import { authedApiRequest } from "@/lib/authedApiRequest";
import { safeFetch } from "@/utils/apiRequest";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { clearPersistedQueryCache } from "@/lib/paidlyIdbQueryPersistence";
import { getOrCreateAppQueryClient } from "@/lib/query-client";

function demoApiUrl(path) {
  const base = import.meta.env.DEV ? "" : getBackendBaseUrl();
  return `${base || ""}${path}`;
}

async function readJson(res) {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Friendly copy for every refusal the demo endpoints can return. Never shows raw server text. */
export function demoErrorMessage(code, fallback = "Something went wrong. Please try again.") {
  switch (code) {
    case "DEMO_RATE_LIMITED":
      return "You've started several demos recently. Please try again in a little while.";
    case "DEMO_BUSY":
      return "The live demo is very busy right now. Please try again in a few minutes.";
    case "DEMO_DISABLED":
    case "DEMO_UNAVAILABLE":
      return "The live demo isn't available right now. You can still create a free Paidly account.";
    case "DEMO_SESSION_EXPIRED":
      return "This demo has ended. Start a fresh demo to keep exploring.";
    case "DEMO_SESSION_NOT_FOUND":
    case "DEMO_SESSION_INVALID":
    case "NOT_A_DEMO_SESSION":
      return "This demo session is no longer active. Start a fresh demo to keep exploring.";
    case "DEMO_SERVICE_UNREACHABLE":
      return "The demo service isn't reachable right now. Please try again in a moment.";
    case "DEMO_RESET_FAILED":
      return "We couldn't reset the demo. Please try again.";
    default:
      return fallback;
  }
}

function demoError(code, fallback) {
  const err = new Error(demoErrorMessage(code, fallback));
  err.code = code || "DEMO_REQUEST_FAILED";
  return err;
}

/** Drops every cached query (memory + IndexedDB) so no data from another session is ever shown. */
export async function purgeLocalAppCaches() {
  try {
    getOrCreateAppQueryClient().clear();
  } catch {
    /* ignore */
  }
  try {
    await clearPersistedQueryCache();
  } catch {
    /* ignore */
  }
}

/**
 * Starts a fresh demo workspace and signs this browser into it.
 * @returns {Promise<{ businessName: string, expiresAt: string | null }>}
 */
export async function startLiveDemo() {
  let res;
  try {
    res = await safeFetch(demoApiUrl("/api/auth/demo"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    throw demoError("DEMO_NETWORK", "We couldn't reach Paidly. Check your connection and try again.");
  }
  const body = await readJson(res);
  if (!res.ok || !body?.access_token || !body?.refresh_token) {
    // No Paidly error code: the API itself did not answer (not deployed, proxy / gateway error).
    const code = body?.code || (!res.ok && !body?.error ? "DEMO_SERVICE_UNREACHABLE" : null);
    if (import.meta.env.DEV) console.warn("[demo] start failed", res.status, code || "(no code)");
    throw demoError(code, "We couldn't start the demo right now. Please try again in a moment.");
  }
  await purgeLocalAppCaches();
  await SupabaseAuthService.signInWithIssuedTokens({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  return {
    businessName: body.demo?.business_name || "Mavela Café",
    expiresAt: body.demo?.expires_at || null,
  };
}

async function postAuthed(path) {
  const res = await authedApiRequest(
    demoApiUrl(path),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
    { reason: "demo_mode", unauthorizedMessage: demoErrorMessage("DEMO_SESSION_INVALID") }
  );
  const body = await readJson(res);
  if (!res.ok) throw demoError(body?.code, "We couldn't complete that. Please try again.");
  return body;
}

/** Restores the caller's demo workspace to the original Mavela Café dataset. */
export async function resetLiveDemo() {
  const body = await postAuthed("/api/auth/demo-reset");
  await purgeLocalAppCaches();
  return { expiresAt: body?.demo?.expires_at || null };
}

/** Ends the demo now: the server deletes the workspace and the demo account. */
export async function endLiveDemo() {
  try {
    await postAuthed("/api/auth/demo-end");
  } catch {
    /* expired / already gone: the cleanup sweep removes it — the visitor is signed out either way */
  }
  await purgeLocalAppCaches();
}
