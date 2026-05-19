import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { parseBody } from "../validateBody.js";
import { signInBodySchema } from "../schemas/apiBodySchemas.js";
import { consumeLoginSlot, getClientIp } from "../loginIpRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { applyApiCors } from "./applyApiCors.js";

/**
 * POST /api/auth/sign-in — IP rate limit + Supabase password sign-in.
 * Client applies returned tokens via supabase.auth.setSession (SupabaseAuthService).
 */
export default async function authSignInHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  try {
    const parsed = parseBody(signInBodySchema, req, res, () =>
      logSecurity("warn", "auth_sign_in_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const { email: normalizedEmail, password, hp } = parsed;

    if (hp) {
      logSecurity("warn", "honeypot_triggered", { ip, path: "/api/auth/sign-in" });
      return res.status(400).json({ error: "Invalid request" });
    }

    const slot = await consumeLoginSlot(ip);
    if (!slot.ok) {
      logSecurity("warn", "auth_sign_in_rate_limited", {
        ip,
        retryAfterSeconds: slot.retryAfterSeconds,
      });
      res.setHeader("Retry-After", String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: "Too many sign-in attempts from this network. Please try again later.",
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    const supabaseAnon = getSupabaseAnonClient();
    if (!supabaseAnon) {
      logSecurity("error", "auth_sign_in_misconfigured", { ip, reason: "no_supabase_anon" });
      return res.status(503).json({
        error:
          "Sign-in service is not configured. Set SUPABASE_ANON_KEY on the API server (same value as the browser anon key).",
      });
    }

    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      logSecurity("warn", "auth_sign_in_failed", {
        ip,
        email: normalizedEmail,
        reason: "invalid_credentials",
      });
      return res.status(401).json({
        error: error.message || "Invalid login credentials",
      });
    }

    const session = data?.session;
    if (!session?.access_token || !session?.refresh_token) {
      logSecurity("warn", "auth_sign_in_failed", {
        ip,
        email: normalizedEmail,
        reason: "no_session",
      });
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    if (!session?.user?.email_confirmed_at) {
      logSecurity("warn", "auth_sign_in_unverified_email", {
        ip,
        email: normalizedEmail,
        userId: session.user?.id || null,
      });
      return res.status(403).json({
        error: "Email not verified. Please verify your email before signing in.",
      });
    }

    logSecurity("info", "auth_sign_in_success", {
      ip,
      email: normalizedEmail,
      userId: session.user?.id || null,
    });

    return res.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      user: session.user,
    });
  } catch (err) {
    logSecurity("error", "auth_sign_in_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Sign-in failed" });
    }
  }
}
