/**
 * Context-layer entrypoint for auth state.
 * Public API re-export for app-wide auth hooks/provider.
 */
export { AuthProvider, useAuth } from "@/contexts/AuthContext.impl";
export { useAuthSessionStore, patchAuthSession } from "@/stores/authSessionStore";
