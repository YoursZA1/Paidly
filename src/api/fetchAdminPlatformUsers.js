import { supabase } from "@/lib/supabaseClient";
import { getAdminDataApiBase } from "@/api/backendClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Platform user directory for admin UI: sourced from Auth API + profiles merge.
 * Includes email_verified from Supabase Auth (not available from profiles RLS alone).
 */
export async function fetchAdminPlatformUsers(limit = 500) {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) {
    throw new Error("Admin platform user API requires Node backend (VITE_SUPABASE_ONLY=1).");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(getSupabaseErrorMessage(sessionError, "Session error"));
  }
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error("Not authenticated");
  }

  const base = getAdminDataApiBase();
  const url = `${String(base).replace(/\/$/, "")}/api/admin/platform-users?limit=${encodeURIComponent(String(limit))}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    credentials: "include",
  });

  const contentType = res.headers.get("content-type") || "";
  const looksJson = /json/i.test(contentType);
  const text = looksJson ? null : await res.text().catch(() => "");
  const payload = looksJson ? await res.json().catch(() => ({})) : {};

  if (!res.ok) {
    const msg =
      (looksJson && payload.error) ||
      (res.status === 401
        ? "Session expired or invalid. Please log in again."
        : res.status === 403
          ? "Admin access required."
          : `HTTP ${res.status}`);
    throw new Error(msg);
  }

  if (!looksJson) {
    const preview = String(text || "").slice(0, 80).replace(/\s+/g, " ");
    throw new Error(
      preview.startsWith("<!") || preview.startsWith("<html")
        ? "Platform users API returned HTML, not JSON — set VITE_SERVER_URL to your Node API host (e.g. https://api.example.com)."
        : "Platform users API returned non-JSON."
    );
  }

  if (!Array.isArray(payload.users)) {
    throw new Error("Invalid platform users response (expected { users: array }).");
  }

  return payload.users;
}
