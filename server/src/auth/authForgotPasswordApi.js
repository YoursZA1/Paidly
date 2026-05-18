import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { parseBody } from "../validateBody.js";
import { forgotPasswordBodySchema } from "../schemas/apiBodySchemas.js";
import { consumeForgotPasswordSlot, getClientIp } from "../loginIpRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { envFlag } from "../envFlags.js";
import { verifyTurnstileToken } from "../turnstileVerify.js";
import { applyApiCors } from "./applyApiCors.js";

/**
 * POST /api/auth/forgot-password — rate limited + Turnstile (when enabled) + Supabase reset email.
 * Always returns { ok: true } on the success path to prevent user enumeration.
 */
export default async function authForgotPasswordHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  try {
    const parsed = parseBody(forgotPasswordBodySchema, req, res, () =>
      logSecurity("warn", "auth_forgot_password_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, redirectTo, turnstile_token, hp } = parsed;

    // Honeypot — bots fill hidden fields; real users never see or touch them.
    if (hp) {
      logSecurity("warn", "honeypot_triggered", { ip, path: "/api/auth/forgot-password" });
      return res.json({ ok: true }); // silent success — don't reveal the check
    }

    // IP rate limit: 5 reset requests / IP / hour to prevent reset-email spam.
    const slot = await consumeForgotPasswordSlot(ip);
    if (!slot.ok) {
      logSecurity("warn", "auth_forgot_password_rate_limited", {
        ip,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many reset requests from this network. Please try again later.",
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    const turnstileEnabled = envFlag("TURNSTILE_ENABLED", false);
    const requireTurnstile = envFlag("TURNSTILE_REQUIRE_FORGOT_PASSWORD", turnstileEnabled);
    if (requireTurnstile) {
      const verify = await verifyTurnstileToken(turnstile_token, req);
      if (!verify.ok) {
        logSecurity("warn", "auth_forgot_password_turnstile_failed", {
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

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_forgot_password_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error: "Password reset service is not configured. Set SUPABASE_ANON_KEY on the API server.",
      });
    }

    // Validate redirectTo against trusted origins — prevents open-redirect in reset emails.
    let safeRedirectTo;
    if (typeof redirectTo === "string" && redirectTo.trim()) {
      try {
        const url = new URL(redirectTo);
        const allowedOrigins = new Set(
          [process.env.CLIENT_ORIGIN, req.headers.origin]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
        );
        const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (allowedOrigins.has(url.origin) && (url.protocol === "https:" || isLocal)) {
          safeRedirectTo = url.toString();
        } else {
          logSecurity("warn", "auth_forgot_password_bad_redirect", {
            ip,
            redirectTo: redirectTo.slice(0, 200),
          });
        }
      } catch {
        // malformed URL — ignore it
      }
    }

    const { error } = await supabaseAnon.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: safeRedirectTo,
    });

    if (error) {
      logSecurity("warn", "auth_forgot_password_failed", {
        ip,
        email: normalizedEmail,
        reason: error.message || "forgot_password_error",
      });
    } else {
      logSecurity("info", "auth_forgot_password_requested", {
        ip,
        email: normalizedEmail,
      });
    }

    // Always return ok to prevent user enumeration.
    return res.json({ ok: true });
  } catch (err) {
    logSecurity("error", "auth_forgot_password_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) return res.status(500).json({ error: "Password reset failed" });
  }
}
