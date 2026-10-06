import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthUserId } from "@/lib/authUserId";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { resolveActiveOrgIdForUser } from "@/api/auth/orgCache.js";
import { DEMO_BUSINESS_NAME, sessionUserIsDemo, setDemoModeActive } from "@/lib/demo/demoModeState";

export const DEMO_MODE_QUERY_ROOT = "demo-mode";

/** Active business's Demo Mode flags, straight from the database (RLS: the owner reads their org). */
async function fetchDemoWorkspace(userId) {
  if (!isSupabaseConfigured) return null;
  const orgId = await resolveActiveOrgIdForUser(userId);
  if (!orgId) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, is_demo, demo_expires_at")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    // Before the Demo Mode migration the columns do not exist: nothing is a demo.
    if (error.code === "42703" || /is_demo|demo_expires_at/i.test(error.message || "")) return null;
    throw error;
  }
  return data || null;
}

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!intervalMs) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Demo Mode for the signed-in user. `isDemo` is true as soon as the session carries the server-set
 * `paidly_demo` claim (no flash of the normal shell) and is confirmed by the organization row.
 * @returns {{ isDemo: boolean, loading: boolean, businessName: string, expiresAt: string | null,
 *   expired: boolean, minutesLeft: number | null, orgId: string | null }}
 */
export function useDemoMode() {
  const { user, session } = useAuth();
  const userId = getAuthUserId(user) || session?.user?.id || null;
  const claim = sessionUserIsDemo(session?.user) || sessionUserIsDemo(user);

  const query = useQuery({
    queryKey: [DEMO_MODE_QUERY_ROOT, userId],
    queryFn: () => fetchDemoWorkspace(userId),
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });

  const org = query.data || null;
  const confirmedNotDemo = query.isSuccess && org && org.is_demo === false;
  const isDemo = Boolean(userId) && (org?.is_demo === true || (claim && !confirmedNotDemo));
  const expiresAt = org?.demo_expires_at || null;
  const now = useNow(isDemo ? 30_000 : 0);

  const value = useMemo(() => {
    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : null;
    const minutesLeft = expiresMs ? Math.max(0, Math.ceil((expiresMs - now) / 60_000)) : null;
    return {
      isDemo,
      loading: Boolean(userId) && query.isLoading,
      businessName: org?.name || DEMO_BUSINESS_NAME,
      expiresAt,
      expired: Boolean(isDemo && expiresMs && expiresMs <= now),
      minutesLeft,
      orgId: org?.id || null,
    };
  }, [isDemo, expiresAt, now, org?.name, org?.id, query.isLoading, userId]);

  useEffect(() => {
    setDemoModeActive(value.isDemo);
  }, [value.isDemo]);

  return value;
}

/** "1 h 42 min" / "8 min" */
export function formatDemoTimeLeft(minutes) {
  if (minutes == null) return null;
  if (minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
