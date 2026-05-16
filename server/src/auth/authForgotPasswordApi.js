import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { parseBody } from "../validateBody.js";
import { forgotPasswordBodySchema } from "../schemas/apiBodySchemas.js";
import { getClientIp } from "../loginIpRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { envFlag } from "../envFlags.js";
import { verifyTurnstileToken } from "../turnstileVerify.js";
import { applyApiCors } from "./applyApiCors.js";

/**
 * POST /api/auth/forgot-password — Turnstile (when enabled) + Supabase reset email.
 * Always returns { ok: true } on success path to avoid user enumeration.
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
    const { email: normalizedEmail, redirectTo, turnstile_token } = parsed;

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
        error:
          "Password reset service is not configured. Set SUPABASE_ANON_KEY on the API server.",
      });
    }

    const { error } = await supabaseAnon.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
    });

    if (error) {
      logSecurity("warn", "auth_forgot_password_failed", {
        ip,
        email: normalizedEmail,
        reason: error.message || "forgot_password_error",
      });
      return res.json({ ok: true });
    }

    logSecurity("info", "auth_forgot_password_requested", {
      ip,
      email: normalizedEmail,
    });
    return res.json({ ok: true });
  } catch (err) {
    logSecurity("error", "auth_forgot_password_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) return res.status(500).json({ error: "Password reset failed" });
  }
}
