/**
 * Supabase client setup (frontend).
 * - Initialize with project URL and anon (public) key only. Never use the service_role key in the frontend.
 * - Credentials are stored securely via environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 * - RLS restricts data per user/role. See docs/SUPABASE_INTEGRATION_CHECKLIST.md.
 * - If env vars are missing, the app still loads and shows a setup message instead of a blank screen.
 */
import { createClient } from "@supabase/supabase-js";

// Normalize URL: Supabase project APIs use .supabase.co only. .supabase.com does not resolve → ERR_NAME_NOT_RESOLVED.
let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
if (supabaseUrl && /\.supabase\.com(\/|$)/i.test(supabaseUrl)) {
  supabaseUrl = supabaseUrl.replace(/\.supabase\.com/gi, ".supabase.co");
  if (import.meta.env.DEV) {
    console.warn("[Supabase] VITE_SUPABASE_URL was .supabase.com; using .supabase.co. Update .env to https://YOUR_REF.supabase.co");
  }
}
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// When not configured, use a resolvable hostname to avoid "server with specified hostname could not be found".
// Auth/DB calls will fail with 4xx until real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
const effectiveUrl = supabaseUrl || "https://supabase.com";
const effectiveKey = supabaseAnonKey || "not-configured";

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
