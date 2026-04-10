import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfileQuery } from "@/hooks/useUserProfileQuery";
import { isSupabaseConfigured } from "@/lib/supabase";
import { queueListFilterPrefsMerge } from "@/lib/listFilterPrefsQueue";
import {
  readListFilters,
  writeListFilters,
  hasLocalListFilters,
} from "@/lib/listFiltersStorage";

const DEBOUNCE_MS = 450;

function setProfileQueryData(queryClient, userId, listFilterPrefs) {
  queryClient.setQueryData(["profile", userId], (prev) => {
    if (!Array.isArray(prev) || !prev[0]) return prev;
    return [{ ...prev[0], list_filter_prefs: listFilterPrefs }];
  });
}

function sectionHasData(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

/**
 * Local + Supabase-backed list filter state (profiles.list_filter_prefs).
 * @param {'invoices'|'clients'|'expenses'} kind
 * @param {Record<string, unknown>} defaults — stable reference (module-level const)
 */
export function usePersistedListFilters(kind, defaults) {
  const { user } = useAuth();
  const userId = user?.supabase_id || user?.auth_id || user?.id || null;
  const queryClient = useQueryClient();
  const { profile, isSuccess } = useUserProfileQuery();

  const [filters, setFilters] = useState(() =>
    readListFilters(userId, kind, defaults)
  );

  const serverHydratedRef = useRef(false);
  const pushedLocalRef = useRef(false);
  const skipRemotePersistRef = useRef(true);

  useEffect(() => {
    serverHydratedRef.current = false;
    pushedLocalRef.current = false;
    skipRemotePersistRef.current = true;
    setFilters(readListFilters(userId, kind, defaults));
  }, [userId, kind, defaults]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !isSuccess || !profile) return;
    if (serverHydratedRef.current) return;

    const remote = profile.list_filter_prefs?.[kind];
    if (sectionHasData(remote) && !hasLocalListFilters(userId, kind)) {
      skipRemotePersistRef.current = true;
      const merged = { ...defaults, ...remote };
      setFilters(merged);
      writeListFilters(userId, kind, merged);
    }

    serverHydratedRef.current = true;
  }, [userId, kind, isSuccess, profile, defaults]);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured || !isSuccess || !profile) return;
    if (pushedLocalRef.current) return;

    const remote = profile.list_filter_prefs?.[kind];
    if (sectionHasData(remote)) {
      pushedLocalRef.current = true;
      return;
    }
    if (!hasLocalListFilters(userId, kind)) {
      pushedLocalRef.current = true;
      return;
    }

    pushedLocalRef.current = true;
    const local = readListFilters(userId, kind, defaults);
    queueListFilterPrefsMerge(userId, { [kind]: local }).then((merged) => {
      if (merged) setProfileQueryData(queryClient, userId, merged);
    });
  }, [userId, kind, isSuccess, profile, defaults, queryClient]);

  useEffect(() => {
    writeListFilters(userId, kind, filters);
    if (!userId || !isSupabaseConfigured) return;

    if (skipRemotePersistRef.current) {
      skipRemotePersistRef.current = false;
      return;
    }

    const t = setTimeout(() => {
      queueListFilterPrefsMerge(userId, { [kind]: filters }).then((merged) => {
        if (merged) setProfileQueryData(queryClient, userId, merged);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [filters, userId, kind, queryClient]);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ ...defaults });
  }, [defaults]);

  return { filters, setFilters, updateFilter, clearFilters };
}
