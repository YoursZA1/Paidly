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
    storage: authPersistStorage,
  },
});
