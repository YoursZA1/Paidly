/**
 * Demo Mode entry. Try Demo installs a browser sandbox (no Supabase user, no company row).
 * Reset and end stay in this browser. The server demo routes remain for the pooled workspace
 * and are not on this path.
 */
import { clearPersistedQueryCache } from "@/lib/paidlyIdbQueryPersistence";
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { clearDemoSandbox, installSandboxSession, resetDemoSandbox } from "@/lib/demo/demoSandboxStore.js";
import { useAppStore } from "@/stores/useAppStore";

function dropPersistedBusinessCache() {
  try {
    useAppStore.getState().reset();
  } catch {
    /* store not ready */
  }
  try {
    localStorage.removeItem("paidly_app_store_v1");
  } catch {
    /* ignore */
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
  await purgeLocalAppCaches();
  dropPersistedBusinessCache();
  const started = installSandboxSession();
  if (!started) {
    throw demoError("DEMO_UNAVAILABLE", "We couldn't start the demo. Please try again.");
  }
  return started;
}

/** Restores this browser's demo to the original Mavela Café dataset. */
export async function resetLiveDemo() {
  const body = resetDemoSandbox();
  dropPersistedBusinessCache();
  await purgeLocalAppCaches();
  return { expiresAt: body?.expiresAt || null };
}

/** Ends the demo in this browser. No production account is deleted because none was created. */
export async function endLiveDemo() {
  clearDemoSandbox();
  await purgeLocalAppCaches();
}
