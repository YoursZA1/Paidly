/**
 * Vercel serverless: GET /api/track-link?token=&u=
 * Records first click on CTA, then redirects to the destination URL.
 */
import { createClient } from "@supabase/supabase-js";

function isValidTrackingToken(token) {
  return (
    typeof token === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token.trim()
    )
  );
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isAllowedRedirectUrl(target, requestHost) {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    const req = (requestHost || "").split(":")[0].toLowerCase();
    if (req && host === req) return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".vercel.app")) return true;
    if (host === "www.paidly.co.za" || host === "paidly.co.za") return true;
    return false;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const rawTok = req.query?.token;
  const rawU = req.query?.u;
  const token = Array.isArray(rawTok) ? rawTok[0] : rawTok;
  const u = Array.isArray(rawU) ? rawU[0] : rawU;

  const trimmed = typeof token === "string" ? token.trim() : "";
  let dest = "";
  try {
    dest = typeof u === "string" ? decodeURIComponent(u) : "";
  } catch {
    dest = "";
  }

  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();

  if (!trimmed || !isValidTrackingToken(trimmed) || !dest || !isAllowedRedirectUrl(dest, host)) {
    return res.status(400).send("Invalid link");
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase
        .from("message_logs")
        .update({ clicked_at: new Date().toISOString() })
        .eq("tracking_token", trimmed)
        .is("clicked_at", null);
    } catch (e) {
      console.warn("[track-link]", e?.message || e);
    }
  }

  res.setHeader("Location", dest);
  return res.status(302).end();
}
