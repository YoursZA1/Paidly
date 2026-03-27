/**
 * Vercel serverless: GET /api/email-track?token=uuid
 * Also supports GET /api/email-track/:token (path) for backwards compatibility.
 * Returns 1x1 GIF; records email open in message_logs.
 */
import { createClient } from "@supabase/supabase-js";

const TRACKING_PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

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

function extractToken(req) {
  const q = req.query || {};
  const fromQuery = q.token || q.t;
  if (fromQuery) {
    const v = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
    if (v) return String(v).trim();
  }
  const url = req.url || "";
  const path = url.split("?")[0];
  const m = path.match(/\/api\/email-track\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]).trim() : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const trimmed = extractToken(req) || "";

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store, private");

  if (!trimmed || !isValidTrackingToken(trimmed)) {
    return res.status(200).send(TRACKING_PIXEL_GIF);
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase
        .from("message_logs")
        .update({ viewed: true, opened_at: new Date().toISOString() })
        .eq("tracking_token", trimmed);
    } catch (e) {
      console.warn("[email-track]", e?.message || e);
    }
  }

  return res.status(200).send(TRACKING_PIXEL_GIF);
}
