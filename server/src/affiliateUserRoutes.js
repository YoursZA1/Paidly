/**
 * User-facing affiliate routes:
 *   POST /api/referrals/create  — attribute a signup referral (JWT)
 *   GET  /affiliate/dashboard   — affiliate stats (JWT, legacy path)
 *   GET  /api/affiliate/dashboard — affiliate stats (canonical path)
 *
 * Admin affiliate routes (approve/decline/list) remain in index.js pending
 * extraction of the shared getAdminFromRequest / logAdminApi helpers.
 */
import { getUserFromRequest } from "./supabaseAuth.js";
import { buildAffiliateDashboardPayload } from "./affiliateDashboardData.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { createReferralAttributionForUser } from "./affiliateReferralCreate.js";

async function handleReferralsCreate(req, res) {
  try {
    const { user, error } = await getUserFromRequest(req);
    if (error || !user?.id) {
      return res.status(401).json({ error: error || "Unauthorized" });
    }
    const referralCode = req.body?.referral_code ?? req.body?.referralCode;
    const result = await createReferralAttributionForUser(supabaseAdmin, {
      referralCode: referralCode != null ? String(referralCode) : "",
      userId: user.id,
    });
    if (!result.ok) {
      const err = result.error;
      if (err === "self_referral" || err === "invalid_affiliate" || err === "invalid_code") {
        return res.status(400).json({ error: err });
      }
      return res.status(500).json({ error: err || "failed" });
    }
    return res.json({ ok: true, idempotent: result.idempotent === true });
  } catch (err) {
    console.error("[referrals/create]", err?.message || err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}

async function handleAffiliateDashboardGet(req, res) {
  try {
    const { user, error } = await getUserFromRequest(req);
    if (error || !user?.id) {
      return res.status(401).json({ error: error || "Unauthorized" });
    }
    const payload = await buildAffiliateDashboardPayload(supabaseAdmin, user.id);
    if (!payload.ok) {
      return res.status(500).json({ error: payload.error || "failed" });
    }
    return res.json(payload);
  } catch (err) {
    console.error("[affiliate/dashboard]", err?.message || err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}

export function registerAffiliateUserRoutes(app) {
  app.post("/api/referrals/create", handleReferralsCreate);

  // Both paths serve the same handler: /affiliate/dashboard is the canonical API
  // host path; /api/affiliate/dashboard is the same-origin Vercel alias.
  app.get("/affiliate/dashboard", handleAffiliateDashboardGet);
  app.get("/api/affiliate/dashboard", handleAffiliateDashboardGet);
}
