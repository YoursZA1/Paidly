import { supabase } from "@/lib/supabaseClient";
import { isAbortError, retryOnAbort } from "@/utils/retryOnAbort";
import {
  getStableSession,
  getStableSessionResult,
  invalidateSessionSnapshot,
} from "@/core/auth/SessionCoordinator";

/**
 * Prefer SessionCoordinator; fall back to getUser + a fresh getSession when the
 * snapshot/store has no user (common right after sign-in races).
 */
export async function getSessionWithRetry() {
  const first = await getStableSessionResult();
  if (first?.data?.session?.user) {
    return first;
  }
  try {
    const { data: userData, error: userErr } = await retryOnAbort(() => supabase.auth.getUser(), 2, 300);
    if (userErr || !userData?.user) {
      return first;
    }
    invalidateSessionSnapshot();
    const second = await getStableSessionResult();
    if (second?.data?.session?.user) {
      return second;
    }
  } catch {
    /* fall through */
  }
  return first;
}

export async function getSessionDataForProfileWrite(cachedUser) {
  try {
    return await getSessionWithRetry();
  } catch (e) {
    if (isAbortError(e) && (cachedUser?.supabase_id || cachedUser?.id)) {
      const id = String(cachedUser.supabase_id || cachedUser.id);
      if (isSupabaseAuthUuid(id)) {
        return { data: { session: { user: { id } } }, error: null };
      }
    }
    throw e;
  }
}

export async function getAuthUserIdForWrites() {
  try {
    const { data, error } = await retryOnAbort(() => supabase.auth.getUser(), 2, 300);
    if (!error && data?.user?.id) {
      return data.user.id;
    }
  } catch {
    /* fall through */
  }
  const session = await getStableSession();
  return session?.user?.id ?? null;
}

export function isSupabaseAuthUuid(id) {
  if (id == null) return false;
  const s = String(id).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}
