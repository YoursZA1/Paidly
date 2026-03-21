/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@/api/entities";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { supabase } from "@/lib/supabaseClient";
import { createPageUrl } from "@/utils";
import { backendApi } from "@/api/backendClient";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import Button from "@/components/ui/button";

function getCachedUser() {
  try {
    const s = localStorage.getItem("breakapi_user");
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getCachedUser);
  const [loading, setLoading] = useState(() => !getCachedUser());
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const session = await SupabaseAuthService.getSession();
      if (session?.user) {
        // Fetch profile from Supabase as soon as session is confirmed (handles login, refresh, new tab)
        const currentUser = await User.restoreFromSupabaseSession(session);
        setUser(currentUser ?? null);
      } else {
        setUser(null);
      }
      setError("");
    } catch {
      setUser(null);
      setError("");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const newSession = await SupabaseAuthService.getSession();
      setSession(newSession);
    } catch {
      setSession(null);
    }
  }, []);

  // Initialize: one getSession, then restore user from profile (avoids duplicate getSession + User.me round trips)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialSession = await SupabaseAuthService.getSession();
        if (cancelled) return;
        setSession(initialSession);
        let currentUser = null;

        if (initialSession?.user) {
          try {
            currentUser = await User.restoreFromSupabaseSession(initialSession);
          } catch (restoreErr) {
            console.warn("Restore from session failed:", restoreErr);
          }
        }

        if (!currentUser && initialSession?.user) {
          try {
            currentUser = await User.me();
          } catch {
            // fallback
          }
        }

        if (cancelled) return;
        setUser(currentUser ?? getCachedUser());
        setError(initialSession?.user && !currentUser ? "Failed to restore session" : "");
      } catch (err) {
        console.warn("Auth init error:", err);
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Listen to Supabase auth state (sign in/out, token refresh) to keep session and user in sync
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === "SIGNED_IN" && nextSession) {
        setSession({
          accessToken: nextSession.access_token,
          refreshToken: nextSession.refresh_token,
          expiresAt: nextSession.expires_at,
          user: nextSession.user,
        });
        await refreshUser();
      } else if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
      } else if (event === "TOKEN_REFRESHED" && nextSession) {
        setSession({
          accessToken: nextSession.access_token,
          refreshToken: nextSession.refresh_token,
          expiresAt: nextSession.expires_at,
          user: nextSession.user,
        });
        await refreshUser();
      } else if (event === "INITIAL_SESSION" && nextSession?.user) {
        setSession({
          accessToken: nextSession.access_token,
          refreshToken: nextSession.refresh_token,
          expiresAt: nextSession.expires_at,
          user: nextSession.user,
        });
        await refreshUser();
      }
    });
    return () => subscription.unsubscribe();
  }, [refreshUser]);

  // Auto-update profile (and assets like logo) when the profiles row changes (e.g. Settings save, another tab, or admin)
  useSupabaseRealtime(
    user?.id ? ["profiles"] : [],
    useCallback(() => {
      refreshUser();
    }, [refreshUser]),
    { channelName: "auth-profile-updates" }
  );

  const login = useCallback(async ({ email, password, role }) => {
    setError("");
    const normalizedEmail = (email || "").trim().toLowerCase();
    const session = await SupabaseAuthService.signInWithEmail(normalizedEmail, password);
    setSession(session);
    // Always use Supabase role if present
    const supabaseRole = session?.user?.app_metadata?.role;
    const effectiveRole = supabaseRole || role || undefined;

    await User.login({ email: normalizedEmail, password, role: effectiveRole });

    if (session?.user?.id) {
      await User.updateMyUserData({
        supabase_id: session.user.id,
        auth_id: session.user.id,
        role: effectiveRole,
        permissions: session.user.app_metadata?.permissions || [],
      });
    }

    // If email is not confirmed, show dialog but allow access
    if (session?.user && session.user.email_confirmed_at == null) {
      setShowVerifyDialog(true);
    }

    // Use current user from client to avoid extra User.me() round trip (faster login)
    const currentUser = await User.getCurrentUser();
    setUser(currentUser ?? null);
  }, []);

  const purgeSupabaseAuthStorage = useCallback(() => {
    const shouldRemoveKey = (k) =>
      typeof k === "string" &&
      (k === "supabase.auth.token" || /^sb-.*-auth-token$/i.test(k));

    try {
      if (typeof localStorage !== "undefined") {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (shouldRemoveKey(k)) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      // ignore
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (shouldRemoveKey(k)) keys.push(k);
        }
        keys.forEach((k) => sessionStorage.removeItem(k));
      }
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    // 1. Clear local state immediately so the UI shows logged out and redirect is never blocked.
    purgeSupabaseAuthStorage();
    try {
      await User.logout();
    } catch {
      // ignore
    }
    setSession(null);
    setUser(null);
    setError("");
    setShowVerifyDialog(false);
    setResendLoading(false);
    setResendSuccess("");

    // 2. Best-effort server sign-out with timeout so this promise always resolves.
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("signOut timeout")), 3000)
      );
      await Promise.race([
        supabase.auth.signOut({ scope: "global" }).then(({ error }) => {
          if (error) throw error;
        }),
        timeout
      ]);
    } catch (e) {
      if (import.meta.env?.DEV) {
        console.warn("[Auth] Supabase signOut failed or timed out.", e?.message || e);
      }
      try {
        await SupabaseAuthService.signOut();
      } catch {
        // ignore
      }
    }
  }, [purgeSupabaseAuthStorage]);

  /** Supabase-only password reset (no client-side tokens; expiry handled by Supabase). */
  const sendPasswordReset = useCallback(async (email) => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}${createPageUrl("ResetPassword")}`
        : undefined;
    await SupabaseAuthService.resetPasswordForEmail((email || "").trim().toLowerCase(), redirectTo);
    return true;
  }, []);

  /**
   * Admin team invite: server calls Supabase Admin API with service role (never in the browser).
   * Requires backend with SUPABASE_SERVICE_ROLE_KEY and admin JWT.
   */
  const sendUserInvite = useCallback(async (email, fullName, role, plan) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session?.access_token) {
      throw new Error("You must be signed in to send invitations.");
    }
    const token = sessionData.session.access_token;
    const redirect_to = typeof window !== "undefined" ? window.location.origin : undefined;
    try {
      const { data } = await backendApi.post(
        "/api/admin/invite-user",
        {
          email: (email || "").trim().toLowerCase(),
          full_name: fullName,
          role,
          plan,
          redirect_to,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (data?.ok) {
        return `An invitation email was sent to ${email.trim()}. They can use the link in that email to set their password and sign in.`;
      }
      throw new Error("Invite request did not complete.");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Invite failed. Ensure the backend is running and configured (SUPABASE_SERVICE_ROLE_KEY).";
      throw new Error(msg);
    }
  }, []);

  const handleResendConfirmation = async (email) => {
    setResendLoading(true);
    setResendSuccess("");
    try {
      await SupabaseAuthService.signInWithMagicLink(email);
      setResendSuccess("Confirmation email resent! Please check your inbox.");
    } catch (e) {
      setResendSuccess(e?.message || "Failed to resend confirmation email.");
    } finally {
      setResendLoading(false);
    }
  };

  const value = useMemo(() => {
    const userRole = user?.role || session?.user?.app_metadata?.role || null;
    const userPermissions = user?.permissions || session?.user?.app_metadata?.permissions || [];
    return {
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
      refreshSession,
      sendPasswordReset,
      sendUserInvite,
      showVerifyDialog,
      setShowVerifyDialog,
      resendLoading,
      resendSuccess,
      handleResendConfirmation,
      error,
      userRole,
      userPermissions,
      session
    };
  }, [user, loading, login, logout, refreshUser, refreshSession, sendPasswordReset, sendUserInvite, showVerifyDialog, resendLoading, resendSuccess, error, session]);

  return <>
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    {/* Email not verified dialog (global) */}
    {showVerifyDialog && user && (
      <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold mb-2">Email not verified</h2>
          <p className="mb-4">Your email address has not been confirmed. Please check your inbox and click the confirmation link.</p>
          <Button onClick={() => handleResendConfirmation(user.email)} disabled={resendLoading} className="w-full mb-2">
            {resendLoading ? "Resending..." : "Resend confirmation email"}
          </Button>
          {resendSuccess && <div className="text-green-600 text-sm mt-2">{resendSuccess}</div>}
          <Button variant="outline" onClick={() => setShowVerifyDialog(false)} className="w-full mt-2">Close</Button>
        </div>
      </div>
    )}
  </>;
}

const AUTH_FALLBACK = {
  user: null,
  loading: false,
  isAuthenticated: false,
  session: null,
  error: "",
  login: async () => {},
  signup: async () => {},
  logout: () => {},
  refreshUser: async () => {},
  refreshSession: async () => {},
  sendPasswordReset: async () => {},
  sendUserInvite: async () => {},
  setShowVerifyDialog: () => {},
  showVerifyDialog: false,
  resendLoading: false,
  resendSuccess: "",
  handleResendConfirmation: async () => {},
  userRole: null,
  userPermissions: [],
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (import.meta.env?.DEV) {
      console.warn("[Auth] useAuth called outside AuthProvider (e.g. during HMR). Using fallback. If you see this after a hot reload, refresh the page.");
      return AUTH_FALLBACK;
    }
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
