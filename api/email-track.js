/**
 * Vercel serverless:
 * - GET  /api/email-track?token=uuid                 (pixel open)
 * - POST /api/track-open (rewritten here with mode)  (json open event)
 * - GET  /api/track-link?token=&u=                   (rewritten here with mode)
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

function readTokenFromQuery(query) {
  const rawTok = query?.token || query?.t;
  return Array.isArray(rawTok) ? rawTok[0] : rawTok;
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
  const mode = String(req.query?.mode || "pixel").toLowerCase();
  const supabase = getSupabaseAdmin();

  if (mode === "open") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    let body = {};
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
    const trimmed = typeof body?.token === "string" ? body.token.trim() : "";
    if (!trimmed || !isValidTrackingToken(trimmed)) {
      return res.status(400).json({ error: "Invalid token" });
    }
    if (!supabase) return res.status(503).json({ error: "Server misconfigured" });
    try {
      const { error } = await supabase
        .from("message_logs")
        .update({ viewed: true, opened_at: new Date().toISOString() })
        .eq("tracking_token", trimmed);
      if (error) return res.status(500).json({ error: "Failed to record open" });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  }

  if (mode === "link") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).end();
    }
    const token = readTokenFromQuery(req.query);
    const rawU = req.query?.u;
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
