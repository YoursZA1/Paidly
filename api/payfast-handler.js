/**
 * PayFast: subscription checkout + ITN (single function for Hobby limit).
 * Dynamic catch-all files under `/api` are unreliable on Vercel without Next.js;
 * public URLs stay `/api/payfast/subscription`, `/api/payfast/webhook`, etc. via vercel.json rewrites → `__pf`.
 */
import { createClient } from "@supabase/supabase-js";
import { getClientIp } from "../server/src/loginIpRateLimit.js";
import { createPayfastSubscriptionItnHandler } from "../server/src/payfastSubscriptionItn.js";
import payfastSubscriptionCheckout from "./payfast/_checkout.js";

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
  const route = String(req.query.__pf || "").trim();

  if (route === "subscription") {
    return payfastSubscriptionCheckout(req, res);
  }
  if (route === "webhook" || route === "subscription/itn") {
    return payfastSubscriptionItnApi(req, res);
  }

  return res.status(404).json({ error: "Not found" });
}
