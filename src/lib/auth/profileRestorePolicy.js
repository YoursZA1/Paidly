import { isAbortError, isTransientFetchFailure } from "@/utils/retryOnAbort";

/**
 * GoTrue holds an auth lock for the duration of `onAuthStateChange`.
 * Calling getSession/setSession in that callback aborts in-flight auth I/O
 * ("signal is aborted without reason") and surfaces as
 * "The request was interrupted. Please try again."
 *
 * Defer work until after the lock is released. setTimeout(0) is required;
 * queueMicrotask can still run inside the lock.
 *
 * @param {() => unknown} fn
 * @returns {ReturnType<typeof setTimeout>}
 */
export function deferAfterAuthLock(fn) {
  return setTimeout(() => {
    try {
      void fn();
    } catch {
      /* listener must never throw */
    }
  }, 0);
}

export function isTransientSessionReadFailure(error) {
  return isAbortError(error) || isTransientFetchFailure(error);
}

/**
 * Keep a just-established login when getSession is aborted or flaky.
 * Only drop the app user when we positively have no store session.
 *
 * @param {{ storeSession?: { user?: { id?: string }, accessToken?: string } | null, storeUser?: { id?: string } | null, error?: unknown }} args
 */
export function shouldKeepHydratedUserOnSessionReadFailure({ storeSession, storeUser, error } = {}) {
  const hasStoreSession = Boolean(storeSession?.user?.id);
  const hasStoreUser = Boolean(storeUser?.id);
  if (!hasStoreSession && !hasStoreUser) return false;
  if (isTransientSessionReadFailure(error)) return true;
  return hasStoreSession;
}

/**
 * Prefer a live getSession result; otherwise reuse the in-memory session from login.
 *
 * @param {object | null | undefined} liveSession
 * @param {object | null | undefined} storeSession
 */
export function resolveSessionForProfileRestore(liveSession, storeSession) {
  if (liveSession?.user?.id) return liveSession;
  if (storeSession?.user?.id) return storeSession;
  return null;
}

/** Dashboard may paint only after a profiles query finished (including "no row"). */
export function isProfileReady(user, storeReady) {
  if (storeReady === true) return true;
  return user?.profileReady === true;
}

/**
 * Keep the JWT session in memory, but do not mount Layout / CompanyContext
 * until a profiles query has completed.
 */
export function shouldWaitForProfileRestore(sessionUserId, user, storeReady) {
  return Boolean(sessionUserId) && !isProfileReady(user, storeReady);
}

export function withProfileReady(user, ready) {
  if (!user || typeof user !== "object") return user;
  return { ...user, profileReady: Boolean(ready) };
}
