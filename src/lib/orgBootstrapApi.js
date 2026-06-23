import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequestJson } from "@/utils/apiRequest";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";
import { getSessionAccessTokenOrHandleUnauthorized } from "@/lib/rpcSessionPolicy";

const TAB_ID =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

const BOOTSTRAP_INFLIGHT = new Map();

const LOCK_TTL_MS = 45_000;

function circuitKey(userId) {
  return `paidly_org_bootstrap_circuit:${userId}`;
}

export function getOrgBootstrapCircuitOpenUntil(userId) {
  if (typeof localStorage === "undefined") return 0;
  try {
    const v = Number(localStorage.getItem(circuitKey(userId)) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function recordOrgBootstrapFailure(userId) {
  if (typeof localStorage === "undefined") return;
  try {
    const now = Date.now();
    const prev = getOrgBootstrapCircuitOpenUntil(userId);
    const stretching = prev > now;
    const bump = stretching ? Math.min(240_000, Math.max(8_000, (prev - now) * 2)) : 8_000;
    const jitter = Math.floor(Math.random() * 1600);
    localStorage.setItem(circuitKey(userId), String(now + bump + jitter));
  } catch {
    /* ignore */
  }
}

function clearOrgBootstrapFailureCircuit(userId) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(circuitKey(userId));
  } catch {
    /* ignore */
  }
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withOrgBootstrapLock(userId, fn) {
  const name = `paidly-org-bootstrap:${userId}`;
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(name, { mode: "exclusive" }, () => fn());
  }

  const storageKey = `paidly_org_bootstrap_lock:${userId}`;
  const spinUntil = Date.now() + 12_000;
  let acquired = false;
  while (Date.now() < spinUntil && !acquired) {
    const now = Date.now();
    let busy = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const { owner, until } = JSON.parse(raw);
        if (until > now && owner !== TAB_ID) busy = true;
      }
    } catch {
      /* ignore */
    }
    if (!busy) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ owner: TAB_ID, until: now + LOCK_TTL_MS }));
        acquired = true;
      } catch {
        acquired = true;
      }
      break;
    }
    await sleep(90 + Math.random() * 70);
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const p = JSON.parse(raw);
          if (p.owner === TAB_ID) localStorage.removeItem(storageKey);
        }
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Single-flight + cross-tab lock around POST /api/auth/bootstrap-user.
 * Idempotent on the server; callers should re-read membership after success.
 *
 * @param {string} effectiveUserId
 * @param {{
 *   orgName?: string | null,
 *   signal?: AbortSignal,
 *   getExistingOrgId?: () => Promise<string | null | undefined>,
 * }} [options]
 */
export async function runOrgBootstrapWithLock(effectiveUserId, options = {}) {
  if (isRecoveryCircuitOpen()) {
    return { ok: false, skipped: true, reason: "terminal_auth_state" };
  }
  const uid = String(effectiveUserId || "");
  if (!uid) throw new Error("Bootstrap requires user id");

  if (BOOTSTRAP_INFLIGHT.has(uid)) {
    return BOOTSTRAP_INFLIGHT.get(uid);
  }

  const task = (async () => {
    return withOrgBootstrapLock(uid, async () => {
      if (typeof options.getExistingOrgId === "function") {
        try {
          const existing = await options.getExistingOrgId();
          if (existing) {
            clearOrgBootstrapFailureCircuit(uid);
            return { ok: true, org_id: existing, skipped: true };
          }
        } catch {
          /* continue to POST */
        }
      }
      const apiBase = import.meta.env.DEV ? "" : getBackendBaseUrl();
      const url = `${apiBase}/api/auth/bootstrap-user`;
      const body = { user_id: uid, org_name: options.orgName ? String(options.orgName) : "" };

      // bootstrap-user authenticates the caller server-side via admin.auth.getUser(token),
      // so it requires `Authorization: Bearer <jwt>`. Without it the server returns
      // 401 "Missing bearer token" (the failure seen in production). Acquire the session
      // token (with the shared refresh/unauthorized policy) and attach it.
      const accessToken = await getSessionAccessTokenOrHandleUnauthorized("org_bootstrap");
      if (!accessToken) {
        return { ok: false, skipped: true, reason: "missing_access_token" };
      }

      try {
        const data = await apiRequestJson(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: options.signal,
        });
        if (data && typeof data === "object" && data.ok === true) {
          clearOrgBootstrapFailureCircuit(uid);
        }
        return data;
      } catch (e) {
        const status = Number(e?.response?.status ?? 0);
        if (status >= 500 || status === 429 || status === 408) {
          recordOrgBootstrapFailure(uid);
        }
        throw e;
      }
    });
  })().finally(() => {
    BOOTSTRAP_INFLIGHT.delete(uid);
  });

  BOOTSTRAP_INFLIGHT.set(uid, task);
  return task;
}

export function clearOrgBootstrapInflight() {
  BOOTSTRAP_INFLIGHT.clear();
}
