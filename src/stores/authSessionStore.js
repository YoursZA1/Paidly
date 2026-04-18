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

  resetAuthLoadingGate: () => set({ authLoadingTimedOut: false }),
}));

/** Imperative updates from AuthProvider (avoids stale closures in auth listeners). */
export function patchAuthSession(partial) {
  useAuthSessionStore.setState(partial);
}
