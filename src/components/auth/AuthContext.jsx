/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@/api/entities";
import SupabaseAuthService from "@/services/SupabaseAuthService";
import { supabase } from "@/lib/supabaseClient";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import Button from "@/components/ui/button";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
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

  // Initialize: restore Supabase session and user state (session persistence across reloads)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initialSession = await SupabaseAuthService.getSession();
        if (cancelled) return;
        setSession(initialSession);
        let currentUser = null;
        try {
          currentUser = await User.me();
        } catch {
          // No local user (e.g. localStorage cleared); try restoring from Supabase session
          if (initialSession?.user) {
            currentUser = await User.restoreFromSupabaseSession();
          }
        }
        if (cancelled) return;
        setUser(currentUser);
        setError(initialSession?.user && !currentUser ? "Failed to restore session" : "");
      } catch {
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

  const logout = useCallback(async () => {
    try {
      await SupabaseAuthService.signOut();
    } finally {
      await User.logout();
      setSession(null);
      setUser(null);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    // Generate reset token and store with expiry (1 hour)
    const resetToken = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const expiresAt = Date.now() + 3600000; // 1 hour

    const resetRequests = JSON.parse(
      localStorage.getItem("breakapi_password_resets") || "{}"
    );
    resetRequests[resetToken] = {
      email,
      expiresAt,
      createdAt: Date.now()
    };
    localStorage.setItem("breakapi_password_resets", JSON.stringify(resetRequests));

    // Return the reset link
    return `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/reset-password?token=${resetToken}`;
  }, []);

  const sendUserInvite = useCallback(async (email, fullName, role, plan) => {
    // Generate invite token and store with expiry (7 days)
    const inviteToken = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const expiresAt = Date.now() + 604800000; // 7 days

    const invites = JSON.parse(
      localStorage.getItem("breakapi_invites") || "{}"
    );
    invites[inviteToken] = {
      email,
      full_name: fullName,
      role,
      plan,
      expiresAt,
      accepted: false,
      createdAt: Date.now()
    };
    localStorage.setItem("breakapi_invites", JSON.stringify(invites));

    // Return the invite link
    return `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "")}/accept-invite?token=${inviteToken}`;
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
