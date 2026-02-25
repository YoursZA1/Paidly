/**
 * Legacy Supabase client export.
 *
 * IMPORTANT:
 * - This project is Vite-based, so `process.env.*` is not available in the browser.
 * - Importing this file must never throw during module evaluation (otherwise the app
 *   can blank-screen before React mounts).
 *
 * Prefer importing from `@/lib/supabaseClient`.
 */

export { supabase } from "@/lib/supabaseClient";
