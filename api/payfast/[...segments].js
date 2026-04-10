/**
 * Single Vercel function: checkout + ITN (Hobby plan function limit).
 * - POST /api/payfast/subscription
 * - POST /api/payfast/webhook, /api/payfast/subscription/itn (and rewrites from vercel.json)
 */
import { createClient } from "@supabase/supabase-js";
import { getClientIp } from "../../server/src/loginIpRateLimit.js";
import { createPayfastSubscriptionItnHandler } from "../../server/src/payfastSubscriptionItn.js";
import payfastSubscriptionCheckout from "./_checkout.js";

function normalizeSegments(req) {
  const raw = req.query?.segments;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function payfastSubscriptionItnApi(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).send("Server misconfigured");
  }
  const run = createPayfastSubscriptionItnHandler({ supabase, getClientIp });
  return run(req, res);
}

export default async function handler(req, res) {
  const segs = normalizeSegments(req);
  const route = segs.join("/");

  if (route === "subscription") {
    return payfastSubscriptionCheckout(req, res);
  }
  if (route === "webhook" || route === "subscription/itn") {
    return payfastSubscriptionItnApi(req, res);
  }

  return res.status(404).json({ error: "Not found" });
}
