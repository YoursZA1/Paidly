import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env.development") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

/**
 * Anonymous Supabase client for password sign-in on the server (same as browser anon key).
 * Optional: route returns 503 if missing so the API can still boot without it.
 */
/**
 * Supabase client that acts AS the signed-in caller (their access token, anon key): every query and
 * storage call goes through RLS exactly like the browser would. Use it for writes the database should
 * authorize itself (plan-feature triggers, company RLS) — never the service role for those.
 * @param {string} accessToken verified bearer token from the request
 */
export function getSupabaseUserClient(accessToken) {
  if (!supabaseUrl || !supabaseAnonKey || !accessToken) {
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

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
