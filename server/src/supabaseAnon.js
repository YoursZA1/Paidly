import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

/**
 * Anonymous Supabase client for password sign-in on the server (same as browser anon key).
 * Optional: route returns 503 if missing so the API can still boot without it.
 */
export function getSupabaseAnonClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
