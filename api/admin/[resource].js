import { postgrestErrorToApiBody } from "../../server/src/postgrestErrorToApiBody.js";
import { mergeAffiliateApplicationsWithPartnersAndStats } from "../../server/src/affiliateAdminApplicationsEnrich.js";

/**
 * Vercel serverless: /api/admin/:resource (Hobby plan: single function for many admin routes)
 *
 * GET: affiliates | platform-users | platform-user-messages | sync-users | security-events
 * POST: approve | decline | invite-user | clean-orphaned-users | send-platform-message
 *
 * /api/security/events → vercel.json rewrite → /api/admin/security-events
 */
// Lazy-deps: avoids Vercel import-time crashes in some runtimes.
// If any dependency fails to load, our handler catch will return JSON.
let createClient;
let assertCallerForAdminRoute;
let fetchMergedPlatformUsersForAdmin;
let fetchSyncUsersForAdmin;
let getSecurityEventsSnapshot;
let handleVercelAffiliateDeclinePost;
let handleVercelAdminInviteUserPost;
let affiliateApproveHandler;
let applyPaidlyServerlessCors;
let validateServiceRoleKey;
let runAdminDeleteOrphanProfiles;
let getAdminPlatformUserMessages;
let isAdminPlatformMessageClientError;
let broadcastAdminUpdateToAllUsers;
let validateAdminBroadcastPayload;

let corsPromise = null;
let getDepsPromise = null;
let approveDeclineDepsPromise = null;
let inviteUserDepsPromise = null;
let sendPlatformMessageDepsPromise = null;

async function ensureCorsDeps() {
  if (applyPaidlyServerlessCors) return;
  if (corsPromise) return corsPromise;
  corsPromise = import("../../server/src/vercelPaidlyCors.js").then((m) => {
    applyPaidlyServerlessCors = m.applyPaidlyServerlessCors;
  });
  return corsPromise;
}

async function ensureGetDeps() {
  await ensureCorsDeps();
  if (createClient) return;
  if (getDepsPromise) return getDepsPromise;
  getDepsPromise = Promise.all([
    import("@supabase/supabase-js"),
    import("../../server/src/adminRouteAccess.js"),
    import("../../server/src/adminPlatformUsersList.js"),
    import("../../server/src/adminSyncUsersList.js"),
    import("../../server/src/adminCleanOrphanProfiles.js"),
    import("../../server/src/securityMiddleware.js"),
    import("../../server/src/supabaseServiceRoleGuard.js"),
    import("../../server/src/adminPlatformUserMessages.js"),
  ]).then(
    ([
      supabaseMod,
      adminRouteAccessMod,
      adminPlatformUsersMod,
      adminSyncUsersMod,
      adminCleanMod,
      securityMiddlewareMod,
      roleGuardMod,
      adminPlatformUserMessagesMod,
    ]) => {
      createClient = supabaseMod.createClient;
      assertCallerForAdminRoute = adminRouteAccessMod.assertCallerForAdminRoute;
      fetchMergedPlatformUsersForAdmin = adminPlatformUsersMod.fetchMergedPlatformUsersForAdmin;
      fetchSyncUsersForAdmin = adminSyncUsersMod.fetchSyncUsersForAdmin;
      runAdminDeleteOrphanProfiles = adminCleanMod.runAdminDeleteOrphanProfiles;
      getSecurityEventsSnapshot = securityMiddlewareMod.getSecurityEventsSnapshot;
      validateServiceRoleKey = roleGuardMod.validateServiceRoleKey;
      getAdminPlatformUserMessages = adminPlatformUserMessagesMod.getAdminPlatformUserMessages;
      isAdminPlatformMessageClientError = adminPlatformUserMessagesMod.isAdminPlatformMessageClientError;
    }
  );
  return getDepsPromise;
}

async function ensureApproveDeclineDeps() {
  await ensureCorsDeps();
  if (affiliateApproveHandler && handleVercelAffiliateDeclinePost) return;
  if (approveDeclineDepsPromise) return approveDeclineDepsPromise;
  approveDeclineDepsPromise = Promise.all([
    import("../affiliates/_approveHandler.js"),
    import("../../server/src/vercelAffiliateDeclinePost.js"),
  ]).then(([affiliateApproveMod, affiliateDeclineMod]) => {
    affiliateApproveHandler = affiliateApproveMod.default;
    handleVercelAffiliateDeclinePost = affiliateDeclineMod.handleVercelAffiliateDeclinePost;
  });
  return approveDeclineDepsPromise;
}

async function ensureInviteUserDeps() {
  await ensureCorsDeps();
  if (handleVercelAdminInviteUserPost) return;
  if (inviteUserDepsPromise) return inviteUserDepsPromise;
  inviteUserDepsPromise = import("../../server/src/vercelAdminInviteUserPost.js").then((m) => {
    handleVercelAdminInviteUserPost = m.handleVercelAdminInviteUserPost;
  });
  return inviteUserDepsPromise;
}

let handleVercelSendPlatformMessagePost;
async function ensureSendPlatformMessageDeps() {
  await ensureCorsDeps();
  if (handleVercelSendPlatformMessagePost) return;
  if (sendPlatformMessageDepsPromise) return sendPlatformMessageDepsPromise;
  sendPlatformMessageDepsPromise = import("../../server/src/vercelAdminSendPlatformMessagePost.js").then((m) => {
    handleVercelSendPlatformMessagePost = m.handleVercelSendPlatformMessagePost;
  });
  return sendPlatformMessageDepsPromise;
}

let broadcastDepsPromise = null;
async function ensureBroadcastDeps() {
  await ensureGetDeps();
  if (broadcastAdminUpdateToAllUsers && validateAdminBroadcastPayload) return;
  if (broadcastDepsPromise) return broadcastDepsPromise;
  broadcastDepsPromise = import("../../server/src/adminBroadcastUpdate.js").then((m) => {
    broadcastAdminUpdateToAllUsers = m.broadcastAdminUpdateToAllUsers;
    validateAdminBroadcastPayload = m.validateAdminBroadcastPayload;
  });
  return broadcastDepsPromise;
}

/** Vercel usually sets `query.resource`; fall back to path if missing (rewrites / some runtimes). */
function adminResourceFromRequest(req) {
  const fromQuery = String(req.query?.resource ?? "").trim();
  if (fromQuery) return fromQuery;
  try {
    const path = String(req.url || "").split("?")[0] || "";
    const marker = "/api/admin/";
    const i = path.indexOf(marker);
    if (i === -1) return "";
    const rest = path.slice(i + marker.length).replace(/\/$/, "");
    const seg = rest.split("/")[0];
    return decodeURIComponent(seg || "").trim();
  } catch {
    return "";
  }
}

function cors(res, req) {
  applyPaidlyServerlessCors(req, res, { methods: "GET, POST, OPTIONS" });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { client: null, configError: "Server misconfigured (Supabase)." };
  const roleCheck = validateServiceRoleKey?.(key) ?? { ok: true };
  if (!roleCheck.ok) return { client: null, configError: roleCheck.message };
  return {
    client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }),
    configError: null,
  };
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
    console.error(
      "[GET /api/admin/affiliates] affiliate_applications:",
      appsRes.error.code,
      appsRes.error.message,
      appsRes.error.details
    );
    const body = postgrestErrorToApiBody(appsRes.error);
    return res.status(500).json(body || { error: "affiliate_applications query failed" });
  }

  const rawApplications = appsRes.data || [];
  const partners = partnersRes.error ? [] : partnersRes.data || [];
  const applications = await mergeAffiliateApplicationsWithPartnersAndStats(supabase, rawApplications, partners);
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

async function handleSyncUsers(req, res, supabase) {
  try {
    const { users } = await fetchSyncUsersForAdmin(supabase);
    console.log(`[GET /api/admin/sync-users] ${users.length} users`);
    return res.status(200).json({ users });
  } catch (e) {
    console.error("[GET /api/admin/sync-users]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to sync users" });
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
  try {
    const resource = adminResourceFromRequest(req);
    const getResources = new Set([
      "affiliates",
      "platform-users",
      "platform-user-messages",
      "sync-users",
      "security-events",
    ]);
    const postResources = new Set([
      "approve",
      "decline",
      "invite-user",
      "clean-orphaned-users",
      "send-platform-message",
      "broadcast-update",
    ]);

    if (postResources.has(resource)) {
      if (req.method === "OPTIONS") {
        await ensureCorsDeps();
        applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
        return res.status(200).end();
      }
      if (req.method === "POST") {
        if (resource === "clean-orphaned-users") {
          await ensureGetDeps();
          cors(res, req);
          const { client: supabase, configError } = getSupabaseAdmin();
          if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

          const authHeader = req.headers.authorization || "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) return res.status(401).json({ error: "Missing bearer token" });

          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

          const deny = await assertCallerForAdminRoute(supabase, authData.user, {});
          if (deny) return res.status(deny.status).json(deny.body);

          try {
            const result = await runAdminDeleteOrphanProfiles(supabase);
            console.log(`[POST /api/admin/clean-orphaned-users] deleted=${result.deleted}`);
            return res.status(200).json(result);
          } catch (e) {
            console.error("[POST /api/admin/clean-orphaned-users]", e?.message || e);
            return res.status(500).json({ error: e?.message || "Failed to clean orphaned profiles" });
          }
        }
        if (resource === "approve") {
          await ensureApproveDeclineDeps();
          return affiliateApproveHandler(req, res);
        }
        if (resource === "decline") {
          await ensureApproveDeclineDeps();
          return handleVercelAffiliateDeclinePost(req, res);
        }
        if (resource === "invite-user") {
          await ensureInviteUserDeps();
          return handleVercelAdminInviteUserPost(req, res);
        }
        if (resource === "send-platform-message") {
          await ensureSendPlatformMessageDeps();
          return handleVercelSendPlatformMessagePost(req, res);
        }
        if (resource === "broadcast-update") {
          await ensureBroadcastDeps();
          cors(res, req);
          const { client: supabase, configError } = getSupabaseAdmin();
          if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

          const authHeader = req.headers.authorization || "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) return res.status(401).json({ error: "Missing bearer token" });

          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

          const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
          if (deny) return res.status(deny.status).json(deny.body);

          let body = req.body;
          if (typeof body === "string") {
            try {
              body = JSON.parse(body);
            } catch {
              return res.status(400).json({ error: "Invalid JSON" });
            }
          }

          try {
            const payload = { subject: body?.subject, content: body?.content };
            validateAdminBroadcastPayload(payload);
            const { users } = await fetchMergedPlatformUsersForAdmin(supabase, 2000);
            const result = await broadcastAdminUpdateToAllUsers(
              supabase,
              authData.user.id,
              users,
              payload
            );
            return res.status(200).json({ ok: true, ...result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const status = /content is required|subject too long|content too long|Invalid sender_id/i.test(msg)
              ? 400
              : 500;
            return res.status(status).json({ error: msg });
          }
        }
      }
      return res.status(405).json({ error: "Method not allowed" });
    }

    await ensureGetDeps();
    cors(res, req);
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    if (!resource || !getResources.has(resource)) {
      return res.status(404).json({ error: "Not found" });
    }

    const { client: supabase, configError } = getSupabaseAdmin();
    if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

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

    if (resource === "sync-users") {
      return handleSyncUsers(req, res, supabase);
    }

    if (resource === "platform-user-messages") {
      const recipientId = String(req.query?.recipient_id ?? "").trim();
      let threadLimit = 100;
      if (req.query?.thread_limit != null && String(req.query.thread_limit).trim() !== "") {
        const n = Number(String(req.query.thread_limit).trim());
        if (!Number.isInteger(n) || n < 1 || n > 200) {
          return res.status(400).json({ error: "Invalid thread_limit (use integer 1–200)" });
        }
        threadLimit = n;
      }
      let listLimit = 500;
      if (req.query?.list_limit != null && String(req.query.list_limit).trim() !== "") {
        const n = Number(String(req.query.list_limit).trim());
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          return res.status(400).json({ error: "Invalid list_limit (use integer 1–1000)" });
        }
        listLimit = n;
      }
      try {
        const data = await getAdminPlatformUserMessages(supabase, {
          recipientId: recipientId || undefined,
          threadLimit,
          listLimit,
        });
        return res.status(200).json({ ok: true, ...data });
      } catch (e) {
        const msg = e?.message || "Failed to load messages";
        const status = isAdminPlatformMessageClientError(msg) ? 400 : 500;
        console.error("[GET /api/admin/platform-user-messages]", msg);
        return res.status(status).json({ error: msg });
      }
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
  } catch (e) {
    // Vercel would otherwise respond with a generic 500 + no details.
    console.error("[GET /api/admin/[resource]] handler crash:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "Admin handler crashed", message: msg });
  }
}
