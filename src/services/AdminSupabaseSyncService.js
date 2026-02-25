import { supabase } from "@/lib/supabaseClient";
import AdminDataService from "@/services/AdminDataService";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const STORAGE_KEYS = {
  USERS: "breakapi_users",
  SUPABASE_USERS: "breakapi_supabase_users",
  SUPABASE_ORGS: "breakapi_supabase_organizations",
  SUPABASE_MEMBERSHIPS: "breakapi_supabase_memberships",
  SUPABASE_CLIENTS: "breakapi_supabase_clients",
  SUPABASE_SERVICES: "breakapi_supabase_services",
  SUPABASE_INVOICES: "breakapi_supabase_invoices",
  SUPABASE_QUOTES: "breakapi_supabase_quotes",
  SUPABASE_PAYMENTS: "breakapi_supabase_payments",
  SUPABASE_ASSETS: "breakapi_supabase_assets",
  SUPABASE_META: "breakapi_supabase_sync_meta"
};

const getStoredUsers = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.USERS);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveSupabaseData = (payload, status = "success", errorMessage = null) => {
  localStorage.setItem(STORAGE_KEYS.SUPABASE_USERS, JSON.stringify(payload.users || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_ORGS, JSON.stringify(payload.organizations || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_MEMBERSHIPS, JSON.stringify(payload.memberships || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_CLIENTS, JSON.stringify(payload.clients || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_SERVICES, JSON.stringify(payload.services || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_INVOICES, JSON.stringify(payload.invoices || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_QUOTES, JSON.stringify(payload.quotes || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_PAYMENTS, JSON.stringify(payload.payments || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_ASSETS, JSON.stringify(payload.assets || []));
  localStorage.setItem(STORAGE_KEYS.SUPABASE_META, JSON.stringify({
    bucket: payload.bucket || null,
    synced_at: new Date().toISOString(),
    status,
    error: errorMessage
  }));
};

const saveSyncFailure = (message) => {
  localStorage.setItem(STORAGE_KEYS.SUPABASE_META, JSON.stringify({
    bucket: null,
    synced_at: new Date().toISOString(),
    status: "failed",
    error: message || "Sync failed"
  }));
};

const mergeUsers = (existingUsers, supabaseUsers) => {
  const byEmail = new Map();
  const bySupabaseId = new Map();

  existingUsers.forEach((user) => {
    if (user?.email) {
      byEmail.set(user.email.toLowerCase(), user);
    }
    if (user?.supabase_id) {
      bySupabaseId.set(user.supabase_id, user);
    }
  });

  let matched = 0;
  let updated = 0;
  const mergedFromSupabase = supabaseUsers.map((user) => {
    const email = user?.email?.toLowerCase() || "";
    const existing = (email && byEmail.get(email)) || bySupabaseId.get(user.id) || null;
    const profile = user?.profile || null;
    const userMeta = user?.user_metadata || {};
    const appMeta = user?.app_metadata || {};
    const nextUser = {
      ...existing,
      id: existing?.id || user.id,
      supabase_id: user.id,
      auth_id: user.id,
      email: email,
      full_name: existing?.full_name || profile?.full_name || userMeta.full_name || userMeta.name || "",
      role: appMeta.role || existing?.role || "user",
      status: existing?.status || "active",
      plan: existing?.plan || "free",
      company_name: existing?.company_name || "",
      company_address: existing?.company_address || "",
      phone: existing?.phone || "",
      currency: existing?.currency || "ZAR",
      timezone: existing?.timezone || "UTC",
      logo_url: existing?.logo_url ?? profile?.logo_url ?? null,
      created_at: existing?.created_at || user.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existing) {
      matched += 1;
      const changed = nextUser.supabase_id !== existing.supabase_id ||
        nextUser.role !== existing.role ||
        nextUser.full_name !== existing.full_name;
      if (changed) {
        updated += 1;
      }
    }

    return nextUser;
  });

  const supabaseIds = new Set(supabaseUsers.map((user) => user.id));
  const supabaseEmails = new Set(supabaseUsers.map((user) => (user.email || "").toLowerCase()));
  const untouched = existingUsers.filter((user) => {
    const email = (user?.email || "").toLowerCase();
    if (user?.supabase_id && supabaseIds.has(user.supabase_id)) {
      return false;
    }
    if (email && supabaseEmails.has(email)) {
      return false;
    }
    return true;
  });

  const added = mergedFromSupabase.filter((user) => !existingUsers.some((existing) => existing.id === user.id)).length;
  const mergedUsers = [...mergedFromSupabase, ...untouched];

  return { mergedUsers, matched, updated, added };
};

/**
 * Get last sync status from localStorage (for monitoring / debugging).
 * @returns {{ status: 'success'|'failed', synced_at: string|null, error: string|null }}
 */
export function getSyncStatus() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPABASE_META);
    const meta = raw ? JSON.parse(raw) : null;
    return {
      status: meta?.status ?? null,
      synced_at: meta?.synced_at ?? null,
      error: meta?.error ?? null
    };
  } catch {
    return { status: null, synced_at: null, error: null };
  }
}

export const syncAdminData = async () => {
  try {
    // Refresh session so the access token is valid (reduces 401 from expired token)
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
    let session = sessionData?.session;
    let err = sessionError;
    if (!session) {
      const { data: getData, error: getError } = await supabase.auth.getSession();
      session = getData?.session;
      if (!err) err = getError;
    }
    if (err) {
      const msg = getSupabaseErrorMessage(err, "Failed to get session");
      console.error("[sync] Session error:", msg);
      throw new Error(msg);
    }
    const accessToken = session?.access_token;
    if (!accessToken) {
      console.warn("[sync] No Supabase session (not logged in?)");
      throw new Error("No Supabase session. Please log in and try again.");
    }

    const serverUrl = (import.meta.env.VITE_SERVER_URL || "http://localhost:5179").replace(/\/$/, "");
    const url = `${serverUrl}/api/admin/sync-data`;
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        },
        credentials: "include"
      });
    } catch (networkErr) {
      const msg = getSupabaseErrorMessage(networkErr, "Network error");
      console.error("[sync] Network error:", msg);
      const hint = serverUrl.includes("localhost")
      ? "Start the backend from the project root with: npm run server (or from server/: npm run dev). Ensure .env has VITE_SERVER_URL=http://localhost:5179 if the server runs on another port."
      : "Check that the backend is reachable and VITE_SERVER_URL is correct.";
      throw new Error("Cannot reach the server. " + hint);
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json().catch(() => ({})) : {};

    if (!response.ok) {
      const errMsg = payload.error || (response.status === 401 ? "Session expired or invalid. Please log in again." : response.status === 403 ? "Admin access required." : `HTTP ${response.status}`);
      console.error("[sync] Server error:", response.status, errMsg);
      throw new Error(payload.error || errMsg);
    }

    if (!isJson || payload === null) {
      throw new Error("Invalid response from server. Expected JSON.");
    }

    const supabaseUsers = Array.isArray(payload.users) ? payload.users : [];

    saveSupabaseData(payload, "success", null);

    const existingUsers = getStoredUsers();
    const { mergedUsers, matched, updated, added } = mergeUsers(existingUsers, supabaseUsers);

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(mergedUsers));
    AdminDataService.clearCache();
    AdminDataService.broadcastDataChange("supabaseSync", {
      matched,
      updated,
      added
    });

    const counts = {
      users: supabaseUsers.length,
      organizations: payload.organizations?.length || 0,
      memberships: payload.memberships?.length || 0,
      clients: payload.clients?.length || 0,
      services: payload.services?.length || 0,
      invoices: payload.invoices?.length || 0,
      quotes: payload.quotes?.length || 0,
      payments: payload.payments?.length || 0,
      assets: payload.assets?.length || 0
    };
    console.log("[sync] Success:", { matched, updated, added, ...counts });

    return {
      matched,
      updated,
      added,
      counts
    };
  } catch (error) {
    const message = getSupabaseErrorMessage(error, "Sync failed");
    saveSyncFailure(message);
    AdminDataService.broadcastDataChange("supabaseSyncFailed", { error: message });
    console.error("[sync] Failed:", message);
    throw error instanceof Error && error.message === message ? error : new Error(message);
  }
};
