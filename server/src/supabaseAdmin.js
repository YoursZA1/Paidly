import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { validateServiceRoleKey } from "./supabaseServiceRoleGuard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Missing server Supabase env vars. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to server/.env (see server/.env.example)."
  );
}

const roleCheck = validateServiceRoleKey(supabaseServiceKey);
if (!roleCheck.ok) {
  throw new Error(roleCheck.message);
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
