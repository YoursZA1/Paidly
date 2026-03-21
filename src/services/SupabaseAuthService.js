import { supabase } from "@/lib/supabaseClient";
import { backendApi, isProductionBackendUrlLocalhost } from "@/api/backendClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

const mapAuthError = (error) => getSupabaseErrorMessage(error, "Authentication error");

/** Axios: DNS failure, offline, CORS preflight abort, etc. Often surfaces as message "Network Error". */
function isAxiosTransportFailure(err) {
  if (!err || err.isAxiosError !== true) return false;
  if (!err.response) return true;
  if (err.code === "ERR_NETWORK") return true;
  return /network error/i.test(String(err.message || ""));
}

function humanizeTransportMessage(isSignUp) {
  const verb = isSignUp ? "sign-up" : "sign-in";
  return (
    `Could not reach the ${verb} API (network). If you do not host a Node API, remove VITE_SERVER_URL from Vercel and redeploy so login uses Supabase directly. ` +
    "If you do host an API, set VITE_SERVER_URL to a reachable URL (no trailing slash) with working DNS/TLS."
  );
}

function humanizeSupabaseTransportMessage() {
  return (
    "Could not reach Supabase (auth). Check VITE_SUPABASE_URL (https://…supabase.co), VITE_SUPABASE_ANON_KEY (JWT anon key starting with eyJ, not sb_publishable_), VPN/ad blockers, then redeploy."
  );
}

function looksLikeNetworkFailureText(msg) {
  const low = String(msg || "").toLowerCase();
  return (
    low.includes("network error") ||
    low.includes("failed to fetch") ||
    low.includes("load failed") ||
    low.includes("err_name_not_resolved") ||
    low.includes("could not connect") ||
    low === "fetch failed"
  );
}

const normalizeSession = (session) => {
  if (!session) return null;
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: session.user
  };
};

const SupabaseAuthService = {
  /**
   * Sign-up via POST /api/auth/sign-up (IP rate limits + abuse tiers on the API).
   * Dev: falls back to direct Supabase if the API is unavailable.
   */
  async signUpWithEmail(email, password, profile = {}) {
    const normalized = (email || "").trim().toLowerCase();

    const signUpDirect = async () => {
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: profile },
      });
      if (error) {
        const msg = mapAuthError(error);
        if (looksLikeNetworkFailureText(msg)) {
          throw new Error(humanizeSupabaseTransportMessage());
        }
        throw new Error(msg);
      }
      return {
        session: normalizeSession(data.session),
        user: data.user ?? null,
      };
    };

    if (isProductionBackendUrlLocalhost()) {
      return signUpDirect();
    }

    try {
      const { data, status, headers } = await backendApi.post(
        "/api/auth/sign-up",
        { email: normalized, password, data: profile },
        { validateStatus: () => true }
      );

      if (status === 200 && data) {
        const sess = data.session;
        if (sess?.access_token && sess?.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: sess.access_token,
            refresh_token: sess.refresh_token,
          });
          if (sessionError) throw new Error(mapAuthError(sessionError));
        }
        const { data: sessionData, error: getErr } = await supabase.auth.getSession();
        if (getErr) throw new Error(mapAuthError(getErr));
        return {
          session: normalizeSession(sessionData?.session ?? null),
          user: data.user ?? null,
        };
      }

      if (status === 429) {
        const ra = Number(headers?.["retry-after"] ?? data?.retryAfterSeconds);
        const msg =
          Number.isFinite(ra) && ra > 60
            ? `Too many sign-up attempts. Try again in about ${Math.ceil(ra / 60)} minute(s).`
            : Number.isFinite(ra) && ra > 0
              ? `Too many sign-up attempts. Try again in ${ra} second(s).`
              : "Too many sign-up attempts. Please try again later.";
        throw new Error(msg);
      }

      if (import.meta.env.DEV && (status === 503 || status >= 500)) {
        console.warn(
          `[auth] API sign-up returned ${status}; falling back to direct Supabase (development only).`
        );
        return signUpDirect();
      }

      if (status === 503) {
        throw new Error(
          data?.error ||
            "Sign-up service is not available. Configure SUPABASE_ANON_KEY on the API server."
        );
      }

      throw new Error(mapAuthError({ message: data?.error || "Sign up failed" }));
    } catch (err) {
      if (isAxiosTransportFailure(err) && import.meta.env.DEV) {
        console.warn("[auth] API sign-up unreachable; falling back to direct Supabase (development only).");
        return signUpDirect();
      }
      if (isAxiosTransportFailure(err) && import.meta.env.PROD) {
        throw new Error(humanizeTransportMessage(true));
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(String(err?.message || "Sign up failed"));
    }
  },

  /** Resend signup confirmation email (does not reveal whether the email exists). */
  async resendSignupEmail(email) {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: (email || "").trim().toLowerCase(),
    });
    if (error) throw new Error(mapAuthError(error));
    return true;
  },

  /**
   * Password sign-in goes through POST /api/auth/sign-in so the API can rate-limit by IP.
   * Production with missing VITE_SERVER_URL: direct Supabase (API URL would be localhost otherwise).
   * Dev: falls back if the API is down or lacks SUPABASE_ANON_KEY.
   */
  async signInWithEmail(email, password) {
    const normalized = (email || "").trim().toLowerCase();

    const signInDirect = async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (error) {
        const msg = mapAuthError(error);
        if (looksLikeNetworkFailureText(msg)) {
          throw new Error(humanizeSupabaseTransportMessage());
        }
        throw new Error(msg);
      }
      return normalizeSession(data.session);
    };

    if (isProductionBackendUrlLocalhost()) {
      return signInDirect();
    }

    try {
      const { data, status, headers } = await backendApi.post(
        "/api/auth/sign-in",
        { email: normalized, password },
        { validateStatus: () => true }
      );

      if (status === 200 && data?.access_token && data?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (sessionError) throw new Error(mapAuthError(sessionError));
        const { data: sessionData, error: getErr } = await supabase.auth.getSession();
        if (getErr) throw new Error(mapAuthError(getErr));
        return normalizeSession(sessionData.session);
      }

      if (status === 429) {
        const ra = Number(headers?.["retry-after"] ?? data?.retryAfterSeconds);
        const msg =
          Number.isFinite(ra) && ra > 60
            ? `Too many sign-in attempts. Try again in about ${Math.ceil(ra / 60)} minute(s).`
            : Number.isFinite(ra) && ra > 0
              ? `Too many sign-in attempts. Try again in ${ra} second(s).`
              : "Too many sign-in attempts. Please try again later.";
        throw new Error(msg);
      }

      if (status === 401) {
        throw new Error(mapAuthError({ message: data?.error || "Invalid login credentials" }));
      }

      if (import.meta.env.DEV && (status === 503 || status >= 500)) {
        console.warn(
          `[auth] API sign-in returned ${status}; falling back to direct Supabase (development only).`
        );
        return signInDirect();
      }

      if (status === 503) {
        throw new Error(
          data?.error ||
            "Sign-in service is not available. Configure SUPABASE_ANON_KEY on the API server."
        );
      }

      throw new Error(data?.error || "Login failed");
    } catch (err) {
      if (isAxiosTransportFailure(err) && import.meta.env.DEV) {
        console.warn("[auth] API sign-in unreachable; falling back to direct Supabase (development only).");
        return signInDirect();
      }
      if (isAxiosTransportFailure(err) && import.meta.env.PROD) {
        throw new Error(humanizeTransportMessage(false));
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new Error(String(err?.message || "Login failed"));
    }
  },

  async signInWithMagicLink(email, redirectTo = null) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo || window.location.origin
      }
    });

    if (error) throw new Error(mapAuthError(error));
    return true;
  },

  async signInWithOAuth(provider, redirectTo = null) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo || window.location.origin
      }
    });

    if (error) throw new Error(mapAuthError(error));
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(mapAuthError(error));
  },

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data.session);
  },

  async getUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(mapAuthError(error));
    return data?.user ?? null;
  },

  /**
   * Send a password reset email. User will receive a link to the redirectTo URL.
   * Redirect URL must be allowed in Supabase Auth URL configuration.
   * Does not reveal whether the email exists (best practice).
   */
  async resetPasswordForEmail(email, redirectTo = null) {
    const to = redirectTo || (typeof window !== "undefined" ? `${window.location.origin}/ResetPassword` : null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: to
    });
    if (error) throw new Error(mapAuthError(error));
    return true;
  },

  /**
   * Update the current user's password. Use after user lands on reset page from email link.
   * Requires an active session (e.g. recovery session from reset link).
   */
  async updatePassword(newPassword) {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data?.session);
  },
};

export default SupabaseAuthService;
