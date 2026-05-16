/**
 * Cloudflare Turnstile server-side verification (signup, forgot-password, waitlist).
 */

function getTurnstileClientIp(req) {
  const raw = String(req.headers?.["x-forwarded-for"] || "").trim();
  if (!raw) return undefined;
  return raw.split(",")[0].trim() || undefined;
}

/**
 * @param {string | undefined} token
 * @param {import("express").Request | { headers?: Record<string, string | string[] | undefined> }} req
 */
export async function verifyTurnstileToken(token, req) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return { ok: false, reason: "turnstile_secret_missing" };
  }
  const t = String(token || "").trim();
  if (!t) {
    return { ok: false, reason: "turnstile_token_missing" };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", t);
  const ip = getTurnstileClientIp(req);
  if (ip) body.set("remoteip", ip);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, reason: "turnstile_http_error", detail: `status_${resp.status}` };
    }
    if (json?.success === true) {
      return { ok: true };
    }
    const code = Array.isArray(json?.["error-codes"]) ? json["error-codes"].join(",") : "turnstile_failed";
    return { ok: false, reason: "turnstile_failed", detail: code };
  } catch (err) {
    return { ok: false, reason: "turnstile_exception", detail: err?.name || err?.message || "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
