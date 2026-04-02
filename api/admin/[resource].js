/**
 * Vercel serverless: /api/admin/:resource (Hobby plan: single function for many admin routes)
 *
 * GET: affiliates | platform-users | security-events
 * POST: approve | decline | invite-user
 *
 * /api/security/events → vercel.json rewrite → /api/admin/security-events
 */
import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../server/src/adminRouteAccess.js";
import { fetchMergedPlatformUsersForAdmin } from "../../server/src/adminPlatformUsersList.js";
import { getSecurityEventsSnapshot } from "../../server/src/securityMiddleware.js";
import { handleVercelAffiliateDeclinePost } from "../../server/src/vercelAffiliateDeclinePost.js";
import { handleVercelAdminInviteUserPost } from "../../server/src/vercelAdminInviteUserPost.js";
import affiliateApproveHandler from "../affiliates/approve.js";

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function countAffiliateApplicationsByStatus(rows) {
  let pending = 0;
  let approved = 0;
  let declined = 0;
  for (const row of rows || []) {
    const s = String(row?.status ?? "").toLowerCase();
    if (s === "pending") pending += 1;
    else if (s === "approved" || s === "accepted") approved += 1;
    else if (s === "declined" || s === "rejected") declined += 1;
  }
  return { pending, approved, declined, total: (rows || []).length };
}

async function handleAffiliates(req, res, supabase, limit) {
  const [appsRes, partnersRes] = await Promise.all([
    supabase.from("affiliate_applications").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("affiliates").select("*").order("created_at", { ascending: false }).limit(limit),
  ]);

  if (appsRes.error) {
    return res.status(500).json({ error: appsRes.error.message });
  }

  const applications = appsRes.data || [];
  const partners = partnersRes.error ? [] : partnersRes.data || [];
  const counts = countAffiliateApplicationsByStatus(applications);
  const data = {
    ok: true,
    applications,
    partners,
    counts,
    ...(partnersRes.error ? { partnerError: partnersRes.error.message } : {}),
  };

  console.log(
    `[GET /api/admin/affiliates] applications=${applications.length} partners=${partners.length} pending=${counts.pending}` +
      (partnersRes.error ? ` partner_fetch_error=${partnersRes.error.message}` : "")
  );
  return res.status(200).json(data);
}

async function handlePlatformUsers(req, res, supabase, limit) {
  try {
    const { users } = await fetchMergedPlatformUsersForAdmin(supabase, limit);
    console.log(`[GET /api/admin/platform-users] ${users.length} platform users`);
    return res.status(200).json({ users });
  } catch (e) {
    console.error("[GET /api/admin/platform-users]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to list platform users" });
  }
}

function handleSecurityEvents(res) {
  return res.status(200).json({
    status: "ok",
    area: "security-events",
    at: new Date().toISOString(),
    summary: getSecurityEventsSnapshot(),
  });
}

export default async function handler(req, res) {
  const resource = String(req.query?.resource || "").trim();
  const getResources = new Set(["affiliates", "platform-users", "security-events"]);
  const postResources = new Set(["approve", "decline", "invite-user"]);

  if (postResources.has(resource)) {
    if (resource === "invite-user") {
      return handleVercelAdminInviteUserPost(req, res);
    }
    if (req.method === "OPTIONS") {
      const origin = req.headers.origin;
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      return res.status(200).end();
    }
    if (req.method === "POST") {
      if (resource === "approve") return affiliateApproveHandler(req, res);
      if (resource === "decline") return handleVercelAffiliateDeclinePost(req, res);
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  if (!resource || !getResources.has(resource)) {
    return res.status(404).json({ error: "Not found" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
  if (deny) return res.status(deny.status).json(deny.body);

  if (resource === "security-events") {
    return handleSecurityEvents(res);
  }

  if (resource === "affiliates") {
    let limit = 150;
    const q = req.query?.limit;
    if (q != null && String(q).trim() !== "") {
      const n = Number(String(q).trim());
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return res.status(400).json({ error: "Invalid limit (use integer 1–500)" });
      }
      limit = n;
    }
    return handleAffiliates(req, res, supabase, limit);
  }

  let limit = 500;
  if (req.query?.limit != null && String(req.query.limit).trim() !== "") {
    const n = Number(String(req.query.limit).trim());
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–2000)" });
    }
    limit = n;
  }
  return handlePlatformUsers(req, res, supabase, limit);
}
