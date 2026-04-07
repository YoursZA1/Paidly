import { supabase } from "@/lib/supabaseClient";
import { resolveProductionBrowserApiBaseUrl } from "@/lib/apiOrigin";

function viteEnvFlag(name) {
  const v = String(import.meta.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function shouldUseNodeAffiliateApi() {
  if (viteEnvFlag("VITE_SUPABASE_ONLY")) return false;
  if (import.meta.env.DEV && !viteEnvFlag("VITE_NODE_AFFILIATE_API")) return false;
  return true;
}

function affiliateDevLog(...args) {
  if (import.meta.env.DEV) console.log(...args);
}

function affiliateDevError(...args) {
  if (import.meta.env.DEV) console.error(...args);
}

/** Stored referral codes; caps size to avoid abusing localStorage. */
export const MAX_SIGNUP_REFERRAL_CODE_LEN = 128;

/** Canonical key (survives reloads). Legacy key migrated on read. */
const REFERRAL_CODE_KEY = "referral_code";
const LEGACY_REF_KEY = "paidly_pending_ref";

export function getPendingReferralCodeFromStorage() {
  try {
    const v =
      window.localStorage.getItem(REFERRAL_CODE_KEY) || window.localStorage.getItem(LEGACY_REF_KEY);
    return v && String(v).trim() ? String(v).trim() : null;
  } catch {
    return null;
  }
}

export function setPendingReferralCode(code) {
  const c = code && String(code).trim();
  if (!c) return;
  const safe = c.length > MAX_SIGNUP_REFERRAL_CODE_LEN ? c.slice(0, MAX_SIGNUP_REFERRAL_CODE_LEN) : c;
  try {
    window.localStorage.setItem(REFERRAL_CODE_KEY, safe);
    try {
      window.localStorage.removeItem(LEGACY_REF_KEY);
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

export function clearPendingReferralCode() {
  try {
    window.localStorage.removeItem(REFERRAL_CODE_KEY);
    window.localStorage.removeItem(LEGACY_REF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Referral code from signup URL: prefers `?ref=` (search) so React Router sees it;
 * also parses legacy `#sign-up?ref=` hashes.
 */
export function parseSignupReferralRef(searchParams, locationHash) {
  const clamp = (s) => {
    const t = String(s || "").trim();
    if (!t) return null;
    return t.length > MAX_SIGNUP_REFERRAL_CODE_LEN ? t.slice(0, MAX_SIGNUP_REFERRAL_CODE_LEN) : t;
  };
  try {
    const fromSearch = searchParams?.get?.("ref");
    const fromQuery = clamp(fromSearch);
    if (fromQuery) return fromQuery;
  } catch {
    /* ignore */
  }
  const hash = String(locationHash || "");
  if (!hash || hash.length < 2) return null;
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const qi = h.indexOf("?");
  if (qi === -1) return null;
  try {
    const params = new URLSearchParams(h.slice(qi + 1));
    const ref = params.get("ref");
    return clamp(ref);
  } catch {
    return null;
  }
}

/**
 * Prefer server `/api/referrals/create` (JWT + service rules); fall back to Supabase RPC if API unreachable.
 */
export async function processPendingAffiliateReferral() {
  const code = getPendingReferralCodeFromStorage();
  if (!code) return { ok: true, skipped: true };

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  const uid = session?.user?.id;
  const accessToken = session?.access_token;
  if (!uid || !accessToken) return { ok: false, error: "no_session" };

  try {
    const res = await fetch("/api/referrals/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ referral_code: code }),
    });
    let json = {};
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    if (res.ok) {
      clearPendingReferralCode();
      return { ok: true, idempotent: json.idempotent === true };
    }
    if (res.status === 400) {
      clearPendingReferralCode();
      return { ok: false, error: json.error || "invalid_or_self" };
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn("[affiliate] /api/referrals/create failed; falling back to RPC", e?.message || e);
    }
  }

  const { data, error } = await supabase.rpc("record_referral_signup", {
    p_code: code,
    p_new_user_id: uid,
  });

  if (error) {
    console.warn("[affiliate] record_referral_signup", error.message);
    return { ok: false, error: error.message };
  }

  const payload = data;
  if (payload?.ok === false) {
    if (payload?.error === "self_referral" || payload?.error === "invalid_code") {
      clearPendingReferralCode();
    }
    return { ok: false, ...payload };
  }

  clearPendingReferralCode();
  return { ok: true, data: payload };
}

export async function recordAffiliateClick(referralCode) {
  if (!referralCode || String(referralCode).trim().length < 2) return;
  const { error } = await supabase.rpc("record_affiliate_click", {
    p_code: String(referralCode).trim(),
  });
  if (error && import.meta.env.DEV) {
    console.warn("[affiliate] record_affiliate_click", error.message);
  }
}

/**
 * Admin: load every affiliate application (all statuses). Uses `select('*')` with no status filter.
 * Implemented in paidlyDataClient (enrichment + normalization).
 */
export { loadAffiliateSubmissionsForAdmin } from "@/api/paidlyDataClient";

/**
 * Submit public affiliate application (insert affiliate_applications).
 * Uses RPC `submit_affiliate_application` (SECURITY DEFINER) so applies succeed even when direct INSERT RLS is misconfigured.
 */
export async function submitAffiliateApplication({ email, fullName, whyPromote, audiencePlatform }) {
  const payload = {
    p_email: String(email).trim().toLowerCase(),
    p_full_name: String(fullName).trim(),
    p_why_promote:
      whyPromote != null && String(whyPromote).trim() !== "" ? String(whyPromote).trim() : null,
    p_audience_platform:
      audiencePlatform != null && String(audiencePlatform).trim() !== ""
        ? String(audiencePlatform).trim()
        : null,
  };

  const { data, error } = await supabase.rpc("submit_affiliate_application", payload);

  if (error) {
    return { ok: false, error: error.message };
  }
  if (data && typeof data === "object" && data.ok === false) {
    const code = data.error;
    if (code === "invalid_email") {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (code === "invalid_name") {
      return { ok: false, error: "Please enter your name." };
    }
    return { ok: false, error: typeof code === "string" ? code : "Submission failed" };
  }
  return { ok: true };
}

/**
 * Node API base for absolute `fetch` URLs.
 *
 * Critical:
 * - **Local:** `VITE_SERVER_URL=http://localhost:5179` (port required — matches `npm run server` / Vite proxy default).
 * - **Production:** `VITE_SERVER_URL=https://api.paidly.co.za` (no trailing slash).
 *
 * If unset or invalid, uses same-origin `/api/...` (Vite dev proxies to the backend).
 */
function resolveApiBaseUrl() {
  const raw = (import.meta.env.VITE_SERVER_URL ?? "").toString().trim();
  if (!raw) return "";

  const base = raw.replace(/\/$/, "");

  try {
    const u = new URL(base);
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1") &&
      !u.port
    ) {
      if (import.meta.env.DEV) {
        console.warn(
          "[Paidly] VITE_SERVER_URL must include the API port for local dev, e.g. http://localhost:5179 (not http://localhost alone). Using same-origin /api."
        );
      }
      return "";
    }
    // Production: avoid https://www… API calls from https://paidly.co.za (apex) — same deployment, CORS breaks cross-host.
    if (import.meta.env.PROD && typeof window !== "undefined") {
      return resolveProductionBrowserApiBaseUrl(base);
    }
    return base;
  } catch {
    if (import.meta.env.DEV) {
      console.warn("[Paidly] VITE_SERVER_URL is not a valid URL; using same-origin /api.", base);
    }
    return "";
  }
}

function getAffiliateDashboardApiUrl() {
  const resolved = resolveApiBaseUrl();
  /** Prefer `/api/affiliate/dashboard` — Vercel serverless; `/affiliate/dashboard` can be served as SPA HTML if rewrites order differs. */
  const path = "/api/affiliate/dashboard";
  affiliateDevLog("[affiliate] API URL resolution:", {
    resolved,
    viteServerUrl: import.meta.env.VITE_SERVER_URL,
  });
  if (resolved) {
    return `${resolved.replace(/\/$/, "")}${path}`;
  }
  return path;
}

async function fetchAffiliateDashboardFromSupabase() {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData?.session?.user?.id;
  if (!uid) return { ok: false, error: "no_session" };

  const { data: affiliate, error: affErr } = await supabase
    .from("affiliates")
    .select("id, referral_code, commission_rate, status, created_at")
    .eq("user_id", uid)
    .eq("status", "approved")
    .maybeSingle();

  if (affErr) {
    return { ok: false, error: affErr.message };
  }

  if (!affiliate) {
    return {
      ok: true,
      affiliate: null,
      stats: { clicks: 0, signups: 0, subscribed: 0, paidUsers: 0, earningsPending: 0, earningsPaid: 0 },
      summary: { signups: 0, paid_users: 0, earnings: 0 },
      recentCommissions: [],
      recentReferrals: [],
    };
  }

  const aid = affiliate.id;

  const [clicksRes, referralsRes, recentReferralsRes, commissionsRes] = await Promise.all([
    supabase.from("affiliate_clicks").select("id", { count: "exact", head: true }).eq("affiliate_id", aid),
    supabase.from("referrals").select("id, status").eq("affiliate_id", aid),
    supabase
      .from("referrals")
      .select("id, referred_user_id, status, created_at")
      .eq("affiliate_id", aid)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("commissions")
      .select("id, amount, status, created_at")
      .eq("affiliate_id", aid)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const referrals = referralsRes.data || [];
  const signups = referrals.filter(
    (r) => r.status === "signed_up" || r.status === "subscribed" || r.status === "paid"
  ).length;
  const subscribed = referrals.filter((r) => r.status === "subscribed" || r.status === "paid").length;
  const paidUsers = referrals.filter((r) => r.status === "paid").length;

  const commissions = commissionsRes.data || [];
  const earningsPending = commissions
    .filter((c) => c.status === "pending" || c.status === "approved")
    .reduce((s, c) => s + Number(c.amount || 0), 0);
  const earningsPaid = commissions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount || 0), 0);

  const earningsTotal = earningsPending + earningsPaid;

  return {
    ok: true,
    affiliate,
    stats: {
      clicks: clicksRes.count ?? 0,
      signups,
      subscribed,
      paidUsers,
      earningsPending,
      earningsPaid,
    },
    summary: { signups, paid_users: paidUsers, earnings: earningsTotal },
    recentCommissions: commissions,
    recentReferrals: recentReferralsRes.data || [],
    referralsError: referralsRes.error?.message,
  };
}

/**
 * Affiliate dashboard: calls Node or Vercel handler at `GET /api/affiliate/dashboard` (same-origin when VITE_SERVER_URL matches page host / apex–www handling).
 * Bearer token required. Falls back to Supabase if the API fails or returns non-JSON (e.g. HTML shell).
 */
export async function fetchAffiliateDashboardData() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  const accessToken = session?.access_token;
  if (!session?.user?.id || !accessToken) {
    if (import.meta.env.DEV) {
      console.warn(
        "[affiliate] fetchAffiliateDashboardData: no session — not calling API (check auth / RequireAuth)."
      );
    }
    return { ok: false, error: "no_session" };
  }

  if (!shouldUseNodeAffiliateApi()) {
    if (import.meta.env.DEV) {
      console.info(
        "[affiliate] Using Supabase data source in dev (set VITE_NODE_AFFILIATE_API=1 to call the Node API)."
      );
    }
    return fetchAffiliateDashboardFromSupabase();
  }

  const url = getAffiliateDashboardApiUrl();
  affiliateDevLog("Fetching affiliate data from API...", url);

  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      affiliateDevError(`[affiliate] API failed with status ${res.status}`);
      throw new Error(`API failed (${res.status})`);
    }

    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("<") || trimmed.startsWith("<!")) {
      throw new Error("affiliate_api_returned_html");
    }
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`affiliate_api_invalid_json: ${e?.message || e}`);
    }
    affiliateDevLog("[affiliate] Dashboard API success", {
      ok: data?.ok,
      affiliate: !!data?.affiliate,
      stats: !!data?.stats,
    });

    if (!data?.ok) {
      affiliateDevError("[affiliate] API returned error:", data?.error);
      return data;
    }
    
    return data;
  } catch (err) {
    const msg = err?.message || String(err);
    if (import.meta.env.DEV || msg.includes("affiliate_api_")) {
      console.warn("[affiliate] API call failed, falling back to Supabase:", msg);
    } else {
      console.warn("[affiliate] API call failed, falling back to Supabase");
    }
    const fallbackData = await fetchAffiliateDashboardFromSupabase();
    return fallbackData;
  }
}
