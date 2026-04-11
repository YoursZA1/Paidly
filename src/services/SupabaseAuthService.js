import { supabase } from "@/lib/supabaseClient";
import {
  backendApi,
  shouldUseNodeAuthApi,
  rememberNodeAuthUnreachable,
  getBackendBaseUrl,
} from "@/api/backendClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { retryOnAbort } from "@/utils/retryOnAbort";

const mapAuthError = (error) => getSupabaseErrorMessage(error, "Authentication error");

function mapOAuthProviderError(error, provider) {
  const raw = String(error?.message || error?.msg || "").trim();
  const low = raw.toLowerCase();
  const p = String(provider || "").toLowerCase();

  if (low.includes("unsupported provider") || low.includes("provider is not enabled")) {
    const name = p ? `${p.charAt(0).toUpperCase()}${p.slice(1)}` : "OAuth";
    return `${name} sign-in is not enabled. Enable it in Supabase Dashboard -> Authentication -> Providers, add client credentials, and include this app URL in allowed redirect URLs.`;
  }

  return mapAuthError(error);
}

/** Axios: DNS failure, offline, CORS preflight abort, etc. Often surfaces as message "Network Error". */
function isAxiosTransportFailure(err) {
  if (!err || err.isAxiosError !== true) return false;
  if (!err.response) return true;
  if (err.code === "ERR_NETWORK") return true;
  return /network error/i.test(String(err.message || ""));
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

function getSafeResetRedirect(redirectTo) {
  const fallback =
    typeof window !== "undefined" ? `${window.location.origin}/ResetPassword` : null;
  const candidate = redirectTo || fallback;
  if (!candidate) return null;
  try {
    const url = new URL(candidate, typeof window !== "undefined" ? window.location.origin : undefined);
    // Prevent open-redirect abuse for password reset links.
    if (typeof window !== "undefined" && url.origin !== window.location.origin) {
      return fallback;
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function getSafeSignupOnboardingRedirect(redirectTo) {
  const fallback =
    typeof window !== "undefined"
      ? `${window.location.origin}/Signup?signup_onboarding=1`
      : null;
  const candidate = redirectTo || fallback;
  if (!candidate) return null;
  try {
    const url = new URL(candidate, typeof window !== "undefined" ? window.location.origin : undefined);
    if (typeof window !== "undefined" && url.origin !== window.location.origin) {
      return fallback;
    }
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

function isNodeAuthRouteUnsupportedStatus(status) {
  const s = Number(status);
  return s === 404 || s === 405 || s === 501;
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

function isTurnstileSignupRequired() {
  const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
  if (!siteKey) return false;
  const enforceRaw = String(import.meta.env.VITE_TURNSTILE_REQUIRE_SIGNUP ?? "").trim().toLowerCase();
  if (enforceRaw) return enforceRaw === "1" || enforceRaw === "true" || enforceRaw === "yes";
  return import.meta.env.PROD;
}

function isTurnstileForgotPasswordRequired() {
  const siteKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
  if (!siteKey) return false;
  const raw = String(import.meta.env.VITE_TURNSTILE_REQUIRE_FORGOT_PASSWORD ?? "").trim().toLowerCase();
  if (raw) return raw === "1" || raw === "true" || raw === "yes";
  return import.meta.env.PROD;
}

const SupabaseAuthService = {
  /**
   * Sign-up: POST /api/auth/sign-up when shouldUseNodeAuthApi() is true; otherwise direct Supabase (default in Vite dev).
   * Falls back to direct Supabase if the API returns 5xx or is unreachable.
   */
  async signUpWithEmail(email, password, profile = {}, options = {}) {
    const normalized = (email || "").trim().toLowerCase();
    const turnstileToken = String(options?.turnstileToken || "").trim();
    const emailRedirectTo = getSafeSignupOnboardingRedirect(options?.emailRedirectTo || null);

    const signUpDirect = async () => {
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: profile, emailRedirectTo: emailRedirectTo || undefined },
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

    if (!shouldUseNodeAuthApi() && !isTurnstileSignupRequired()) {
      return signUpDirect();
    }

    if (!shouldUseNodeAuthApi() && isTurnstileSignupRequired()) {
      throw new Error(
        "Sign-up security challenge is enabled but Node auth API is disabled. Enable VITE_NODE_AUTH_API and configure /api/auth/sign-up."
      );
    }

    try {
      const { data, status, headers } = await backendApi.post(
        "/api/auth/sign-up",
        {
          email: normalized,
          password,
          data: profile,
          turnstile_token: turnstileToken || undefined,
          redirectTo: emailRedirectTo || undefined,
        },
        { validateStatus: () => true, __paidlySilent: true }
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

      if (status === 403) {
        throw new Error(data?.error || "Security verification failed. Please retry the challenge.");
      }

      // API down/misconfigured or route absent (404/405): allow auth via Supabase.
      if (status >= 500 || isNodeAuthRouteUnsupportedStatus(status)) {
        if (isNodeAuthRouteUnsupportedStatus(status)) {
          rememberNodeAuthUnreachable();
        }
        console.warn(`[auth] API sign-up returned ${status}; falling back to direct Supabase.`);
        return signUpDirect();
      }

      throw new Error(mapAuthError({ message: data?.error || "Sign up failed" }));
    } catch (err) {
      if (isAxiosTransportFailure(err)) {
        rememberNodeAuthUnreachable();
        const apiBase = getBackendBaseUrl();
        console.warn(
          `[auth] API sign-up unreachable (network) at ${apiBase}. Falling back to direct Supabase. ` +
            `If you see net::ERR_NAME_NOT_RESOLVED, that host has no DNS — point VITE_SERVER_URL at a real API URL or add a DNS record. ` +
            `If you do not use the Node API, set VITE_SUPABASE_ONLY=1 on Vercel and redeploy.`
        );
        return signUpDirect();
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
   * Password sign-in: POST /api/auth/sign-in when shouldUseNodeAuthApi() is true (production with a real API, or dev with VITE_NODE_AUTH_API=1).
   * Otherwise direct Supabase only — default in Vite dev avoids 503 when the Node server is not running.
   */
  async signInWithEmail(email, password) {
    const normalized = (email || "").trim().toLowerCase();

    const signInDirect = async () => {
      const { data, error } = await retryOnAbort(
        () =>
          supabase.auth.signInWithPassword({
            email: normalized,
            password,
          }),
        2,
        400
      );
      if (error) {
        const msg = mapAuthError(error);
        if (looksLikeNetworkFailureText(msg)) {
          throw new Error(humanizeSupabaseTransportMessage());
        }
        throw new Error(msg);
      }
      return normalizeSession(data.session);
    };

    if (!shouldUseNodeAuthApi()) {
      return signInDirect();
    }

    try {
      const { data, status, headers } = await backendApi.post(
        "/api/auth/sign-in",
        { email: normalized, password },
        { validateStatus: () => true, __paidlySilent: true }
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

      if (status === 403) {
        throw new Error(data?.error || "Email not verified. Please verify your email first.");
      }

      // API unavailable or auth route unsupported (404/405): fall back to Supabase.
      if (status >= 500 || isNodeAuthRouteUnsupportedStatus(status)) {
        if (isNodeAuthRouteUnsupportedStatus(status)) {
          rememberNodeAuthUnreachable();
        }
        console.warn(`[auth] API sign-in returned ${status}; falling back to direct Supabase.`);
        return signInDirect();
      }

      throw new Error(data?.error || "Login failed");
    } catch (err) {
      if (isAxiosTransportFailure(err)) {
        rememberNodeAuthUnreachable();
        const apiBase = getBackendBaseUrl();
        console.warn(
          `[auth] API sign-in unreachable (network) at ${apiBase}. Falling back to direct Supabase. ` +
            `If you see net::ERR_NAME_NOT_RESOLVED, that host has no DNS — point VITE_SERVER_URL at a real API URL or add a DNS record. ` +
            `If you do not use the Node API, set VITE_SUPABASE_ONLY=1 on Vercel and redeploy.`
        );
        return signInDirect();
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

    if (error) throw new Error(mapOAuthProviderError(error, provider));
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(mapAuthError(error));
  },

  async getSession() {
    const { data, error } = await retryOnAbort(() => supabase.auth.getSession(), 3, 400);
    if (error) throw new Error(mapAuthError(error));
    return normalizeSession(data.session);
  },

  async getUser() {
    const { data, error } = await retryOnAbort(() => supabase.auth.getUser(), 3, 400);
    if (error) throw new Error(mapAuthError(error));
    return data?.user ?? null;
  },

  /**
   * Send a password reset email. User will receive a link to the redirectTo URL.
   * Redirect URL must be allowed in Supabase Auth URL configuration.
   * Does not reveal whether the email exists (best practice).
   */
  async resetPasswordForEmail(email, redirectTo = null, options = {}) {
    const to = getSafeResetRedirect(redirectTo);
    const turnstileToken = String(options?.turnstileToken || "").trim();

    if (shouldUseNodeAuthApi() && isTurnstileForgotPasswordRequired()) {
      const { data, status } = await backendApi.post(
        "/api/auth/forgot-password",
        {
          email: (email || "").trim().toLowerCase(),
          redirectTo: to || undefined,
          turnstile_token: turnstileToken || undefined,
        },
        { validateStatus: () => true, __paidlySilent: true }
      );
      if (status === 200 && data?.ok) return true;
      if (status === 403) {
        throw new Error(data?.error || "Security verification failed. Please retry the challenge.");
      }
      if (status === 429) {
        throw new Error("Too many reset requests. Please try again later.");
      }
      throw new Error(data?.error || "Failed to send reset link. Try again later.");
    }

    if (!shouldUseNodeAuthApi() && isTurnstileForgotPasswordRequired()) {
      throw new Error(
        "Password reset security challenge is enabled but Node auth API is disabled. Enable VITE_NODE_AUTH_API and configure /api/auth/forgot-password."
      );
    }

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
