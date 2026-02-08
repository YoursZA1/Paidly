/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react/prop-types */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { User } from "@/api/entities";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async ({ email, password, role }) => {
    await User.login({ email, password, role });
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await User.logout();
    setUser(null);
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

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
      sendPasswordReset,
      sendUserInvite
    }),
    [user, loading, login, logout, refreshUser, sendPasswordReset, sendUserInvite]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
