/**
 * POST /api/referrals/create — reached via vercel.json rewrite with ?__referralsCreate=1
 * Underscore: not a standalone Vercel function.
 */
import { createClient } from "@supabase/supabase-js";
import { createReferralAttributionForUser } from "../../server/src/affiliateReferralCreate.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid token" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const referralCode = body?.referral_code ?? body?.referralCode;
  const result = await createReferralAttributionForUser(supabase, {
    referralCode: referralCode != null ? String(referralCode) : "",
    userId: authData.user.id,
  });

  if (!result.ok) {
    const err = result.error;
    if (err === "self_referral" || err === "invalid_affiliate" || err === "invalid_code") {
      return res.status(400).json({ error: err });
    }
    return res.status(500).json({ error: err || "failed" });
  }

  return res.status(200).json({ ok: true, idempotent: result.idempotent === true });
}
