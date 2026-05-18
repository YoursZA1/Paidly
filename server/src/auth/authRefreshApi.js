import crypto from "node:crypto";
import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { parseBody } from "../validateBody.js";
import { refreshSessionBodySchema } from "../schemas/apiBodySchemas.js";
import { getClientIp } from "../loginIpRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { applyApiCors } from "./applyApiCors.js";
import { authRefreshInFlight } from "./authRefreshState.js";

/**
 * POST /api/auth/refresh — refresh access token with in-process single-flight dedupe.
 */
export default async function authRefreshHandler(req, res) {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip = getClientIp(req);
  let tokenHash = null;
  try {
    const parsed = parseBody(refreshSessionBodySchema, req, res, () =>
      logSecurity("warn", "auth_refresh_bad_request", { ip, reason: "validation" })
    );
    if (!parsed) return;
    const refreshToken = String(parsed.refresh_token || "");
    tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const existing = authRefreshInFlight.get(tokenHash);
    if (existing) {
      const payload = await existing;
      return res.status(payload.status).json(payload.body);
    }

    const refreshPromise = (async () => {
      const supabaseAnon = getSupabaseAnonClient();
      if (!supabaseAnon) {
        logSecurity("error", "auth_refresh_misconfigured", { ip, reason: "no_supabase_anon" });
        return {
          status: 503,
          body: {
            error:
              "Refresh service is not configured. Set SUPABASE_ANON_KEY on the API server (same value as the browser anon key).",
          },
        };
      }

      const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data?.session?.access_token || !data?.session?.refresh_token) {
        logSecurity("warn", "auth_refresh_failed", {
          ip,
          reason: error?.message || "refresh_failed",
        });
        return {
          status: 401,
          body: { error: error?.message || "Session refresh failed" },
        };
      }

      return {
        status: 200,
        body: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at,
          user: data.session.user || null,
        },
      };
    })();

    authRefreshInFlight.set(tokenHash, refreshPromise);
    const payload = await refreshPromise;
    return res.status(payload.status).json(payload.body);
  } catch (err) {
    logSecurity("error", "auth_refresh_exception", {
      ip,
      message: err?.message || "unknown",
    });
    if (!res.headersSent) {
      return res.status(500).json({ error: "Session refresh failed" });
    }
  } finally {
    if (tokenHash) {
      authRefreshInFlight.delete(tokenHash);
    }
  }
}
