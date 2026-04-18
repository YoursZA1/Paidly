import { supabase } from "@/lib/supabaseClient";
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { apiErrorFieldToString } from "@/utils/apiErrorText";
import { apiRequest } from "@/utils/apiRequest";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function buildPlatformUsersFetchUrls(limit) {
  const q = `?limit=${encodeURIComponent(String(limit))}`;
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  const vite = String(import.meta.env.VITE_SERVER_URL ?? "").trim().replace(/\/$/, "");
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");

  push(`/api/admin/platform-users${q}`);
  if (vite) push(`${vite}/api/admin/platform-users${q}`);
  if (adminBase && adminBase !== vite) push(`${adminBase}/api/admin/platform-users${q}`);

  return out;
}

async function fetchPlatformUsersPayloadFromApi(token, lim) {
  const candidates = buildPlatformUsersFetchUrls(lim);
  let lastError = null;

  for (const url of candidates) {
    let res;
    try {
      res = await apiRequest(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        credentials: "include",
      });
    } catch (e) {
      lastError = e?.message || "Network error (Failed to fetch)";
      continue;
    }

    const contentType = res.headers.get("content-type") || "";
    const looksJson = /json/i.test(contentType);
    const text = looksJson ? null : await res.text().catch(() => "");
    const payload = looksJson ? await res.json().catch(() => ({})) : {};

    if (!res.ok) {
      let fromJson = "";
      if (looksJson) {
        const raw = payload.error ?? payload.message;
        if (raw != null && raw !== "") {
          fromJson = apiErrorFieldToString(raw);
        }
      }
      lastError =
        fromJson ||
        (res.status === 401
          ? "Session expired or invalid. Please log in again."
          : res.status === 403
            ? "Admin access required."
            : `HTTP ${res.status}`);
      continue;
    }

    if (!looksJson) {
      const preview = String(text || "").slice(0, 80).replace(/\s+/g, " ");
      lastError =
        preview.startsWith("<!") || preview.startsWith("<html")
          ? "Platform users API returned HTML — set VITE_SERVER_URL to your API host."
          : "Platform users API returned non-JSON.";
      continue;
    }

    if (!Array.isArray(payload.users)) {
      lastError = "Invalid platform users response (expected { users: array }).";
      continue;
    }

    return payload.users;
  }

  throw new Error(lastError || "Platform users admin API failed");
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

  const lim = Math.min(Math.max(1, Number(limit) || 500), 2000);
  return fetchPlatformUsersPayloadFromApi(token, lim);
}
