import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { parseBody } from "../validateBody.js";
import { signUpBodySchema } from "../schemas/apiBodySchemas.js";
import { consumeSignupSlot, getClientIp } from "../loginIpRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { envFlag } from "../envFlags.js";
import { verifyTurnstileToken } from "../turnstileVerify.js";
import { sanitizeSignUpUserMetadata } from "../inputValidation.js";
import { applyApiCors } from "./applyApiCors.js";

/**
 * POST /api/auth/sign-up — IP rate limit, Turnstile (when enabled), Supabase sign-up.
 */
export default async function authSignUpHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  try {
    const parsed = parseBody(signUpBodySchema, req, res, () =>
      logSecurity("warn", "auth_sign_up_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, password, data: profile, turnstile_token, redirectTo } = parsed;

    const slot = await consumeSignupSlot(ip);
    if (!slot.ok) {
      logSecurity("warn", "auth_sign_up_rate_limited", {
        ip,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many sign-up attempts from this network. Please try again later.",
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_sign_up_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error:
          "Sign-up service is not configured. Set SUPABASE_ANON_KEY on the API server (same value as the browser anon key).",
      });
    }

    const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
    const requireTurnstile = envFlag("TURNSTILE_REQUIRE_SIGNUP", turnstileEnabled);
    if (requireTurnstile) {
      const verify = await verifyTurnstileToken(turnstile_token, req);
      if (!verify.ok) {
        logSecurity("warn", "auth_sign_up_turnstile_failed", {
          ip,
          email: normalizedEmail,
          reason: verify.reason,
          detail: verify.detail,
        });
        return res.status(403).json({
          error: "Security verification failed. Please retry and complete the challenge.",
        });
      }
    }

    const userMetadata = sanitizeSignUpUserMetadata(
      profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {}
    );

    let safeEmailRedirectTo;
    if (typeof redirectTo === "string" && redirectTo.trim()) {
      try {
        const url = new URL(redirectTo);
        const allowedOrigins = new Set(
          [process.env.CLIENT_ORIGIN, req.headers.origin]
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        );
        const hostIsLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (allowedOrigins.has(url.origin) && (url.protocol === "https:" || hostIsLocal)) {
          safeEmailRedirectTo = url.toString();
        }
      } catch {
        safeEmailRedirectTo = undefined;
      }
    }

    const { data, error } = await supabaseAnon.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: userMetadata,
        emailRedirectTo: safeEmailRedirectTo,
      },
    });

    if (error) {
      logSecurity("warn", "auth_sign_up_failed", {
        ip,
        email: normalizedEmail,
        reason: error.message || "signup_error",
      });
      return res.status(400).json({
        error: error.message || "Sign up failed",
      });
    }

    const session = data?.session;
    const user = data?.user ?? null;

    logSecurity("info", "auth_sign_up_success", {
      ip,
      email: normalizedEmail,
      userId: user?.id || null,
      session: Boolean(session?.access_token),
    });

    return res.json({
      user,
      session: session
        ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_in: session.expires_in,
            expires_at: session.expires_at,
          }
        : null,
    });
  } catch (err) {
    logSecurity("error", "auth_sign_up_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Sign up failed" });
    }
  }
}
