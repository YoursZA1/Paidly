/**
 * Vercel: secure PayFast webhook (ITN).
 *
 * Security: optional `PAYFAST_ITN_IP_WHITELIST`, required `PAYFAST_PASSPHRASE` in prod/live,
 * MD5 `signature` verification, POST-only.
 *
 * Supabase (service role): `subscriptions` + `profiles.subscription_plan` (+ optional Auth `user_metadata` sync).
 *
 * Routes (see vercel.json): `/api/payfast/webhook`, `/api/payfast/subscription/itn`, `/payfast/subscription/itn` → this handler.
 */
import { createClient } from "@supabase/supabase-js";
import { getClientIp } from "../../server/src/loginIpRateLimit.js";
import { createPayfastSubscriptionItnHandler } from "../../server/src/payfastSubscriptionItn.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function payfastSubscriptionItnApi(req, res) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).send("Server misconfigured");
  }
  const run = createPayfastSubscriptionItnHandler({ supabase, getClientIp });
  return run(req, res);
}
