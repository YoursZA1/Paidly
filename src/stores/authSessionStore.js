import { create } from "zustand";

/**
 * Global auth session slice: single source for user, Supabase-shaped session, and bootstrap loading.
 * AuthProvider is the only writer; consumers use useAuth() or this store with selectors.
 */
export const useAuthSessionStore = create((set) => ({
  user: null,
  /** Normalized session: accessToken, refreshToken, expiresAt, user (JWT user) */
  session: null,
  /** Initial bootstrap or explicit refresh in flight */
  loading: true,
  /** Fired when bootstrap exceeds AUTH_BOOTSTRAP_FAILSAFE_MS without settling — UI may offer retry */
  authLoadingTimedOut: false,
  /**
   * True only after a profiles query completed (row or confirmed missing).
   * JWT-minimal users must not paint the dashboard.
   */
  profileReady: false,

  resetAuthLoadingGate: () => set({ authLoadingTimedOut: false }),
}));

/** Imperative updates from AuthProvider (avoids stale closures in auth listeners). */
export function patchAuthSession(partial) {
  if (!partial || typeof partial !== "object") {
    useAuthSessionStore.setState(partial);
    return;
  }
  // JWT-minimal users must not inherit a previous profileReady=true.
  if (
    Object.prototype.hasOwnProperty.call(partial, "user") &&
    !Object.prototype.hasOwnProperty.call(partial, "profileReady")
  ) {
    useAuthSessionStore.setState({
      ...partial,
      profileReady: partial.user?.profileReady === true,
    });
    return;
  }
  useAuthSessionStore.setState(partial);
}
