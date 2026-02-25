/**
 * Supabase client setup (frontend).
 * - Initialize with project URL and anon (public) key only. Never use the service_role key in the frontend.
 * - Credentials are stored securely via environment variables: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY.
 * - RLS restricts data per user/role. See docs/SUPABASE_INTEGRATION_CHECKLIST.md.
 * - If env vars are missing, the app still loads and shows a setup message instead of a blank screen.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const effectiveUrl = supabaseUrl || "https://placeholder.supabase.co";
const effectiveKey = supabaseAnonKey || "placeholder-anon-key";

export const supabase = createClient(effectiveUrl, effectiveKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
