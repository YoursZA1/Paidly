/**
 * Admin affiliate control plane (backend-only — no browser Supabase reads for the admin queue):
 * 1) Same-origin `GET /api/admin/affiliates` first (Vercel serverless / Vite proxy), then `VITE_SERVER_URL` / admin base fallbacks.
 * 2) **Counts** come from the same payload as the list.
 * 3) **Approve / decline** are `POST /api/admin/approve` and `POST /api/admin/decline` (see AffiliatesPage).
 */
import { supabase } from "@/lib/supabaseClient";
import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { countAffiliateApplicationsByStatus } from "@/utils/affiliateApplicationCounts";
import { finalizeAffiliateApplicationsForAdmin } from "@/api/paidlyDataClient";

/**
 * URL for admin affiliate POST routes. Prefer {@link getAdminDataApiBase} (apex/www-safe); otherwise same-origin
 * `path` — do not force `VITE_SERVER_URL` when the app already serves `/api/*` (e.g. Vercel serverless).
 */
export function resolveAffiliateAdminMutationUrl(pathname) {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (import.meta.env.DEV) return p;
  const adminBase = String(getAdminDataApiBase() ?? "").trim().replace(/\/$/, "");
  if (adminBase) return `${adminBase}${p}`;
  return p;
}

function buildAffiliateAdminFetchUrls(limit) {
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

  // Same-origin (or Vite dev proxy) first — production often serves /api/* via Vercel serverless while
  // VITE_SERVER_URL still points at a legacy Node host; hitting that first makes fetch() throw (Failed to fetch)
  // before we ever try the working route.
  push(`/api/admin/affiliates${q}`);
  push(`/api/affiliates${q}`);
  push(`/api/admin/affiliate-applications${q}`);

  if (vite) {
    push(`${vite}/api/admin/affiliates${q}`);
    push(`${vite}/api/affiliates${q}`);
    push(`${vite}/api/admin/affiliate-applications${q}`);
  }
  if (adminBase && adminBase !== vite) {
    push(`${adminBase}/api/admin/affiliates${q}`);
    push(`${adminBase}/api/affiliates${q}`);
    push(`${adminBase}/api/admin/affiliate-applications${q}`);
  }

  return out;
}

/**
 * Try GET /api/admin/affiliates first, then legacy bundle paths (service role; no user_id filter on applications).
 */
async function fetchAffiliateAdminPayloadFromApi(token, lim) {
  const candidates = buildAffiliateAdminFetchUrls(lim);

  let lastError = null;

  for (const url of candidates) {
    let res;
    try {
      res = await fetch(url, {
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
      lastError =
        (looksJson && payload.error) ||
        (res.status === 401
          ? "Session expired or invalid. Please log in again."
          : res.status === 403
            ? "Admin access required."
            : `HTTP ${res.status}`);
      if (import.meta.env.DEV) {
        console.log(payload.applications ?? null, lastError);
      }
      continue;
    }

    if (!looksJson) {
      const preview = String(text || "").slice(0, 80).replace(/\s+/g, " ");
      lastError =
        preview.startsWith("<!") || preview.startsWith("<html")
          ? "Affiliate API returned HTML — set VITE_SERVER_URL to your API host."
          : "Affiliate API returned non-JSON.";
      if (import.meta.env.DEV) {
        console.log(null, lastError);
      }
      continue;
    }

    if (!Array.isArray(payload.applications)) {
      lastError = "Invalid affiliate response (expected { applications: array }).";
      if (import.meta.env.DEV) {
        console.log(payload, lastError);
      }
      continue;
    }

    if (import.meta.env.DEV) {
      console.log(payload.applications, null);
      console.log(
        "counts",
        payload.counts ?? countAffiliateApplicationsByStatus(payload.applications)
      );
      if (payload.applications.length === 0) {
        console.warn(
          "[affiliate debug] API returned applications: [] → DB empty or upstream filter; service-role routes should return all rows (check server logs)."
        );
      }
    }

    return payload;
  }

  throw new Error(lastError || "Affiliate admin API failed");
}

/**
 * Admin affiliate queue: backend uses service role + **status counts** from the same `select('*')` result.
 * Shape: `{ applications, counts: { pending, approved, declined, total } }`.
 */
export async function fetchAdminAffiliateApplications(limit = 150) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(getSupabaseErrorMessage(sessionError, "Session error"));
  }
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error("Not authenticated");
  }

  const lim = Math.min(Math.max(1, Number(limit) || 150), 500);
  const payload = await fetchAffiliateAdminPayloadFromApi(token, lim);
  const rawApps = payload.applications || [];
  const counts = payload.counts ?? countAffiliateApplicationsByStatus(rawApps);
  const applications = await finalizeAffiliateApplicationsForAdmin(rawApps);
  return { applications, counts };
}

/**
 * React Query loader for `['affiliates']` on admin surfaces (errors propagate — no Supabase list fallback).
 */
export async function affiliateApplicationsAdminQueryFn(limit = 150) {
  return fetchAdminAffiliateApplications(limit);
}
