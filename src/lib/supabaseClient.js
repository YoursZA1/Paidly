/**
 * Single Supabase client for the frontend app.
 *
 * This is the only place where the Supabase client is created. All app code should
 * import { supabase } from "@/lib/supabaseClient" (or from this file). Do not
 * call createClient() elsewhere in the app.
 *
 * - Initialize with project URL and anon (public) key only. Never use the service_role key in the frontend.
 * - **Vite (this app):** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`, `.env.local`, or Vercel.
 *   They must match **Project URL** and **anon public** (JWT `eyJ…`) in Supabase → Settings → API.
 *   Wrong URL/key pairs cause auth to hang or fail with no obvious UI error.
 * - **Not Next.js:** `NEXT_PUBLIC_SUPABASE_*` is **not** exposed to the client unless you add a Vite `envPrefix`
 *   — use `VITE_*` only. Run `node scripts/verify-supabase-config.js` to validate `.env`.
 * - RLS restricts data per user/role. See docs/SUPABASE_INTEGRATION_CHECKLIST.md.
 * - If env vars are missing, the app still loads and shows a setup message instead of a blank screen.
 */
import { createClient } from "@supabase/supabase-js";
import { wrapStorageWithCorruptionGuard } from "@/lib/safeAuthStorage";
import { isRecoveryCircuitOpen } from "@/lib/session/recoveryCircuit";

// Normalize URL: Supabase project APIs use .supabase.co only. .supabase.com does not resolve → ERR_NAME_NOT_RESOLVED.
let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
if (supabaseUrl && /\.supabase\.com(\/|$)/i.test(supabaseUrl)) {
  supabaseUrl = supabaseUrl.replace(/\.supabase\.com/gi, ".supabase.co");
  if (import.meta.env.DEV) {
    console.warn("[Supabase] VITE_SUPABASE_URL was .supabase.com; using .supabase.co. Update .env to https://YOUR_REF.supabase.co");
  }
}
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** `createClient` + Realtime expect the JWT **anon public** key (`eyJ…`), not the newer **publishable** key (`sb_publishable_…`). */
if (supabaseAnonKey && /^sb_publishable_/i.test(String(supabaseAnonKey).trim())) {
  console.warn(
    "[Supabase] VITE_SUPABASE_ANON_KEY is set to a publishable key (sb_publishable_…). Replace it with the JWT anon public key: Dashboard → Project Settings → API → Project API keys → anon public (long string starting with eyJ). On Vercel: Environment Variables → edit VITE_SUPABASE_ANON_KEY → Redeploy."
  );
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// When not configured, use a resolvable hostname to avoid "server with specified hostname could not be found".
// Auth/DB calls will fail with 4xx until real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
const effectiveUrl = supabaseUrl || "https://supabase.com";
const effectiveKey = supabaseAnonKey || "not-configured";

const inMemoryStorage = new Map();
/**
 * Auth session JSON lives in localStorage so tabs/windows share one durable Supabase session.
 * GoTrue still owns token format, refresh, and invalidation via the Supabase client.
 */
const authPersistStorageRaw =
  typeof window !== "undefined" && typeof window.localStorage !== "undefined"
    ? window.localStorage
    : {
        getItem: (key) => (inMemoryStorage.has(key) ? inMemoryStorage.get(key) : null),
        setItem: (key, value) => {
          inMemoryStorage.set(key, String(value));
        },
        removeItem: (key) => {
          inMemoryStorage.delete(key);
        },
      };

const authPersistStorage = wrapStorageWithCorruptionGuard(authPersistStorageRaw);

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    /**
     * GoTrue rotates JWTs on a timer; AuthContext adds:
     * - proactive refresh before expiry (`supabaseAuthRefresh` + `msUntilProactiveRefresh`)
     * - tab visibility / focus / bfcache resync with fatal refresh-token handling
     */
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "paidly-auth",
    storage: authPersistStorage,
  },
  realtime: {
    params: {
      /** Default was 10; modest bump reduces postgres_changes throttling under multi-tab / burst sync (tune with Supabase plan). */
      eventsPerSecond: 20,
    },
  },
});

/**
 * Defense-in-depth: these sensitive RPCs must only run server-side via `/api/*`.
 * If an older/stale client path still calls them, block the browser request and
 * surface a clear warning instead of spamming 403s.
 */
const BLOCKED_BROWSER_RPCS = new Set([
  "bootstrap_user_organization",
  "expire_trial_if_due",
]);
const originalRpc = supabase.rpc.bind(supabase);
const warnedBlockedRpcNames = new Set();
/** In-flight dedupe: identical rpc + args share one promise */
const rpcInflight = new Map();
/** Per-RPC breaker after failures (permission / storms / exhaustion) */
const rpcBreakerState = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rpcRestKey(rest) {
  try {
    return JSON.stringify(rest);
  } catch {
    return String(rest?.length ?? "");
  }
}

function breakerOpenUntil(rpcName) {
  const s = rpcBreakerState.get(rpcName);
  return s?.openUntil ?? 0;
}

function openRpcBreaker(rpcName, err) {
  const prev = rpcBreakerState.get(rpcName);
  const consecutive = (prev?.consecutive ?? 0) + 1;
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");
  const blocked = code === "BLOCKED_CLIENT_RPC" || BLOCKED_BROWSER_RPCS.has(rpcName);
  const permissionLike =
    blocked ||
    code === "42501" ||
    code === "PGRST301" ||
    code === "RPC_CIRCUIT_OPEN" ||
    msg.includes("permission denied") ||
    msg.includes("rls") ||
    msg.includes("not authorized");
  const longCool = permissionLike ? 300_000 : Math.min(120_000, 2500 * 2 ** Math.min(consecutive, 5));
  const jitter = Math.floor(Math.random() * 500);
  rpcBreakerState.set(rpcName, { consecutive, openUntil: Date.now() + longCool + jitter });
}

function clearRpcBreaker(rpcName) {
  rpcBreakerState.delete(rpcName);
}

function isTransientSupabaseRpcError(err) {
  if (!err) return false;
  const code = String(err.code || "").toUpperCase();
  if (code === "BLOCKED_CLIENT_RPC" || code === "RPC_CIRCUIT_OPEN") return false;
  if (code === "RPC_AUTH_TERMINAL") return false;
  if (code === "42501") return false;
  const status = Number(err.status ?? err.statusCode ?? NaN);
  if (Number.isFinite(status) && (status === 401 || status === 403)) return false;
  if (Number.isFinite(status) && (status === 408 || status === 425 || status === 429)) return true;
  if (Number.isFinite(status) && (status === 502 || status === 503 || status === 504)) return true;
  const msg = String(err.message ?? err.details ?? "").toLowerCase();
  if (/timeout|timed out|failed to fetch|network error|networkerror|econnreset|502|503|504/.test(msg)) {
    return true;
  }
  if (code === "57014") return true;
  return false;
}

function terminalMutationError(opName, tableName) {
  const target = tableName ? `${opName}:${tableName}` : opName;
  const error = new Error(`Session requires reauthentication before ${target}`);
  error.code = "MUTATION_AUTH_TERMINAL";
  return error;
}

function wrapMutationGuards(builder, tableName) {
  if (!builder || typeof builder !== "object") return builder;
  const guardedOps = new Set(["insert", "update", "upsert", "delete"]);
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop === "string" && guardedOps.has(prop) && typeof value === "function") {
        return (...args) => {
          if (isRecoveryCircuitOpen()) {
            throw terminalMutationError(prop, tableName);
          }
          return value.apply(target, args);
        };
      }
      return value;
    },
  });
}

const originalFrom = supabase.from.bind(supabase);
supabase.from = (...args) => {
  const tableName = String(args?.[0] || "");
  const builder = originalFrom(...args);
  return wrapMutationGuards(builder, tableName);
};

supabase.rpc = async (fnName, ...rest) => {
  const rpcName = String(fnName || "");
  if (isRecoveryCircuitOpen()) {
    openRpcBreaker(rpcName, { code: "RPC_AUTH_TERMINAL" });
    return {
      data: null,
      error: {
        message: `RPC blocked in terminal auth state: ${rpcName}`,
        code: "RPC_AUTH_TERMINAL",
      },
    };
  }
  if (BLOCKED_BROWSER_RPCS.has(rpcName)) {
    if (!warnedBlockedRpcNames.has(rpcName)) {
      warnedBlockedRpcNames.add(rpcName);
      console.warn(
        `[Supabase] Blocked browser RPC "${rpcName}". Use server API routes instead.`
      );
    }
    openRpcBreaker(rpcName, { code: "BLOCKED_CLIENT_RPC" });
    return {
      data: null,
      error: {
        message: `Blocked client RPC: ${rpcName}`,
        code: "BLOCKED_CLIENT_RPC",
      },
    };
  }

  const now = Date.now();
  if (now < breakerOpenUntil(rpcName)) {
    return {
      data: null,
      error: {
        message: `RPC circuit open for ${rpcName}`,
        code: "RPC_CIRCUIT_OPEN",
      },
    };
  }

  const inflightKey = `${rpcName}:${rpcRestKey(rest)}`;
  if (rpcInflight.has(inflightKey)) {
    return rpcInflight.get(inflightKey);
  }

  const run = (async () => {
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const result = await originalRpc(fnName, ...rest);
      if (!result?.error) {
        clearRpcBreaker(rpcName);
        return result;
      }
      lastErr = result.error;
      if (!isTransientSupabaseRpcError(lastErr)) {
        openRpcBreaker(rpcName, lastErr);
        return result;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(Math.min(10_000, 400 * 2 ** attempt));
      }
    }
    openRpcBreaker(rpcName, lastErr);
    return { data: null, error: lastErr };
  })().finally(() => {
    rpcInflight.delete(inflightKey);
  });

  rpcInflight.set(inflightKey, run);
  return run;
};
