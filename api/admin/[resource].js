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
let applyPaidlyServerlessCors;
let validateServiceRoleKey;
let runAdminDeleteOrphanProfiles;
let getAdminPlatformUserMessages;
let isAdminPlatformMessageClientError;
let broadcastAdminUpdateToAllUsers;
let validateAdminBroadcastPayload;
let assertVercelAffiliateModerationAuth;
let createResendClient;
let parseAffiliateApplicationId;
let parseCommissionFractionFromBody;
let runAffiliateApplicationApprove;

let corsPromise = null;
let getDepsPromise = null;
let approveDeclineDepsPromise = null;
let affiliateApproveDepsPromise = null;
let inviteUserDepsPromise = null;
let sendPlatformMessageDepsPromise = null;
let sendMessageDepsPromise = null;

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
  if (handleVercelAffiliateDeclinePost) return;
  if (approveDeclineDepsPromise) return approveDeclineDepsPromise;
  approveDeclineDepsPromise = import("../../server/src/vercelAffiliateDeclinePost.js").then((affiliateDeclineMod) => {
    handleVercelAffiliateDeclinePost = affiliateDeclineMod.handleVercelAffiliateDeclinePost;
  });
  return approveDeclineDepsPromise;
}

async function ensureAffiliateApproveDeps() {
  await ensureCorsDeps();
  if (
    assertVercelAffiliateModerationAuth &&
    createResendClient &&
    parseAffiliateApplicationId &&
    parseCommissionFractionFromBody &&
    runAffiliateApplicationApprove
  ) {
    return;
  }
  if (affiliateApproveDepsPromise) return affiliateApproveDepsPromise;
  affiliateApproveDepsPromise = Promise.all([
    import("../../server/src/vercelAffiliateModerationAuth.js"),
    import("../../server/src/affiliateModerationCore.js"),
  ]).then(([moderationAuthMod, moderationCoreMod]) => {
    assertVercelAffiliateModerationAuth = moderationAuthMod.assertVercelAffiliateModerationAuth;
    createResendClient = moderationCoreMod.createResendClient;
    parseAffiliateApplicationId = moderationCoreMod.parseAffiliateApplicationId;
    parseCommissionFractionFromBody = moderationCoreMod.parseCommissionFractionFromBody;
    runAffiliateApplicationApprove = moderationCoreMod.runAffiliateApplicationApprove;
  });
  return affiliateApproveDepsPromise;
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
let handleVercelAdminSendMessagePost;
async function ensureSendPlatformMessageDeps() {
  await ensureCorsDeps();
  if (handleVercelSendPlatformMessagePost) return;
  if (sendPlatformMessageDepsPromise) return sendPlatformMessageDepsPromise;
  sendPlatformMessageDepsPromise = import("../../server/src/vercelAdminSendPlatformMessagePost.js").then((m) => {
    handleVercelSendPlatformMessagePost = m.handleVercelSendPlatformMessagePost;
  });
  return sendPlatformMessageDepsPromise;
}

async function ensureSendMessageDeps() {
  await ensureCorsDeps();
  if (handleVercelAdminSendMessagePost) return;
  if (sendMessageDepsPromise) return sendMessageDepsPromise;
  sendMessageDepsPromise = import("../../server/src/vercelAdminSendMessagePost.js").then((m) => {
    handleVercelAdminSendMessagePost = m.handleVercelAdminSendMessagePost;
  });
  return sendMessageDepsPromise;
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

function adminSubpathFromRequest(req) {
  try {
    const path = String(req.url || "").split("?")[0] || "";
    const marker = "/api/admin/";
    const i = path.indexOf(marker);
    if (i === -1) return "";
    return path.slice(i + marker.length).replace(/\/$/, "");
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

function toMinutesAgo(iso) {
  const t = new Date(String(iso || "")).getTime();
  if (!Number.isFinite(t)) return null;
  const diffMs = Date.now() - t;
  return Math.max(0, Math.floor(diffMs / 60000));
}

function deriveEmailHealth(latestSentAt) {
  if (!latestSentAt) {
    return { status: "error", label: "No email activity detected" };
  }
  const mins = toMinutesAgo(latestSentAt);
  if (mins == null) return { status: "warn", label: "Email timestamp unavailable" };
  if (mins <= 5) return { status: "ok", label: `Last success ${mins} min ago` };
  if (mins <= 30) return { status: "warn", label: `Last success ${mins} min ago` };
  return { status: "error", label: `No recent success (${mins} min ago)` };
}

function derivePaymentHealth(latestPayment) {
  if (!latestPayment) {
    return { status: "warn", label: "No payment events yet" };
  }
  const rawStatus = String(
    latestPayment.status ?? latestPayment.payment_status ?? latestPayment.state ?? ""
  ).toLowerCase();
  const at =
    latestPayment.updated_at || latestPayment.paid_at || latestPayment.created_at || null;
  const mins = toMinutesAgo(at);

  const settled = new Set(["paid", "success", "succeeded", "completed", "settled"]);
  const pending = new Set(["pending", "processing", "queued", "initiated", "requires_action"]);

  if (settled.has(rawStatus)) {
    if (mins == null) return { status: "ok", label: "Payments active" };
    return { status: "ok", label: `Last settlement ${mins} min ago` };
  }
  if (pending.has(rawStatus)) {
    if (mins != null && mins > 10) {
      return { status: "warn", label: "Webhook delayed" };
    }
    return { status: "warn", label: "Payment processing" };
  }
  if (rawStatus) {
    return { status: "warn", label: `Latest status: ${rawStatus}` };
  }
  return { status: "warn", label: "Payments state unknown" };
}

async function handleSystemHealth(req, res, supabase) {
  const started = Date.now();
  let api = { status: "ok", label: "Healthy" };
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    const elapsed = Date.now() - started;
    if (error) {
      api = { status: "error", label: `Database error: ${error.message}` };
    } else if (elapsed > 1500) {
      api = { status: "warn", label: `Slow response (${elapsed}ms)` };
    } else {
      api = { status: "ok", label: `Healthy (${elapsed}ms)` };
    }
  } catch (e) {
    api = { status: "error", label: `Timeout detected: ${e?.message || "unknown error"}` };
  }

  const [{ data: latestMessageRows }, { data: latestPaymentRows }] = await Promise.all([
    supabase
      .from("message_logs")
      .select("sent_at")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1),
    supabase
      .from("payments")
      .select("status, payment_status, state, paid_at, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  const latestSentAt = latestMessageRows?.[0]?.sent_at ?? null;
  const latestPayment = latestPaymentRows?.[0] ?? null;

  const email = deriveEmailHealth(latestSentAt);
  const payments = derivePaymentHealth(latestPayment);

  return res.status(200).json({
    status: "ok",
    area: "system-health",
    at: new Date().toISOString(),
    summary: { api, email, payments },
    meta: {
      apiCheckedAt: new Date().toISOString(),
      emailLastSentAt: latestSentAt,
      paymentLastEventAt:
        latestPayment?.updated_at || latestPayment?.paid_at || latestPayment?.created_at || null,
    },
  });
}

async function handleBroadcastJobs(req, res, supabase) {
  let limit = 100;
  if (req.query?.limit != null && String(req.query.limit).trim() !== "") {
    const n = Number(String(req.query.limit).trim());
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–500)" });
    }
    limit = n;
  }
  const cursor = String(req.query?.cursor || "").trim();
  let cursorCreatedAt = "";
  let cursorId = "";
  if (cursor) {
    const idx = cursor.lastIndexOf("::");
    if (idx <= 0) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
    cursorCreatedAt = cursor.slice(0, idx).trim();
    cursorId = cursor.slice(idx + 2).trim();
    if (!cursorCreatedAt || !cursorId || !Number.isFinite(new Date(cursorCreatedAt).getTime())) {
      return res.status(400).json({ error: "Invalid cursor" });
    }
  }
  let query = supabase
    .from("admin_broadcast_jobs")
    .select(
      "id, idempotency_key, sender_id, subject, content, total_recipients, notifications_inserted, messages_inserted, email_sent, email_skipped, email_failed, status, error, created_at, updated_at, started_at, finished_at"
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
    );
  }
  const { data, error } = await query;
  if (error) {
    if (String(error.code || "") === "42P01") {
      return res.status(200).json({ jobs: [] });
    }
    return res.status(500).json({ error: error.message || "Failed to load broadcast jobs" });
  }
  const rows = data || [];
  const hasMore = rows.length > limit;
  const jobs = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && jobs.length
      ? `${String(jobs[jobs.length - 1]?.created_at || "").trim()}::${String(jobs[jobs.length - 1]?.id || "").trim()}`
      : null;
  return res.status(200).json({ jobs, next_cursor: nextCursor });
}

const DEFAULT_ADMIN_SETTINGS = {
  system: {
    siteName: "Paidly",
    supportEmail: "support@paidly.co.za",
    maintenanceMode: false,
  },
  affiliateProgram: {
    defaultCommissionPercent: 15,
    autoApproveApplications: false,
  },
};

function mergeAdminSettingsRows(rows) {
  const out = {
    ...DEFAULT_ADMIN_SETTINGS,
    system: { ...DEFAULT_ADMIN_SETTINGS.system },
    affiliateProgram: { ...DEFAULT_ADMIN_SETTINGS.affiliateProgram },
  };
  for (const row of rows || []) {
    const key = String(row?.key || "").trim();
    const value = row?.value && typeof row.value === "object" ? row.value : {};
    if (!key) continue;
    if (key === "system") out.system = { ...out.system, ...value };
    else if (key === "affiliateProgram") out.affiliateProgram = { ...out.affiliateProgram, ...value };
    else out[key] = value;
  }
  return out;
}

async function handleGetSettings(res, supabase) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("key, value, updated_at, updated_by")
    .in("key", ["system", "affiliateProgram"]);
  if (error) {
    return res.status(500).json({ error: error.message || "Failed to load admin settings" });
  }
  const settings = mergeAdminSettingsRows(data || []);
  return res.status(200).json({ ok: true, settings });
}

async function writeSettingsAudit(supabase, user, payload) {
  const actorRole =
    user?.app_metadata?.role || user?.app_metadata?.claims?.role || user?.user_metadata?.role || null;
  const actorName = user?.user_metadata?.full_name || null;
  const { error } = await supabase.from("audit_logs").insert({
    category: "settings",
    action: "admin_settings_updated",
    actor_id: user?.id || null,
    actor_name: actorName,
    actor_email: user?.email || null,
    actor_role: actorRole,
    entity: "admin_settings",
    metadata: payload,
    description: "Updated admin settings via /api/admin/settings",
    after: payload,
  });
  if (error) {
    throw new Error(`Audit write failed: ${error.message}`);
  }
}

async function rollbackAdminSettingsRows(supabase, previousRows) {
  const rows = Array.isArray(previousRows) ? previousRows : [];
  if (!rows.length) return;
  const restorePayload = rows
    .filter((r) => r?.key)
    .map((r) => ({
      key: r.key,
      value: r.value && typeof r.value === "object" ? r.value : {},
      updated_by: r.updated_by || null,
      updated_at: r.updated_at || new Date().toISOString(),
    }));
  if (!restorePayload.length) return;
  const { error } = await supabase.from("admin_settings").upsert(restorePayload, { onConflict: "key" });
  if (error) {
    throw new Error(`Rollback failed: ${error.message}`);
  }
}

async function handleAffiliateApprovePost(req, res, supabase) {
  await ensureAffiliateApproveDeps();

  const moderator = await assertVercelAffiliateModerationAuth(supabase, req, res);
  if (!moderator) return;

  const resend = createResendClient();
  if (!resend) {
    return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
  }

  const applicationId = parseAffiliateApplicationId(req.body || {});
  if (!applicationId) {
    return res.status(400).json({ error: "Missing applicationId" });
  }

  const commissionFraction = parseCommissionFractionFromBody(req.body || {});
  const result = await runAffiliateApplicationApprove(supabase, resend, {
    applicationId,
    commissionFraction,
    httpRequest: req,
  });

  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(200).json(result.payload);
}

function parseSystemWorkflowBody(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
      return null;
    }
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Missing request body" });
    return null;
  }
  if (String(body.confirmation || "").trim() !== "CONFIRM") {
    res.status(400).json({ error: 'Confirmation required: set confirmation to "CONFIRM"' });
    return null;
  }
  return body;
}

async function writeSystemAuditLog(supabase, payload) {
  const { error } = await supabase.from("audit_logs").insert(payload);
  if (error) throw new Error(`Audit write failed: ${error.message}`);
}

async function getSystemStateSnapshot(supabase) {
  const { data, error } = await supabase
    .from("admin_system_state")
    .select("id, maintenance_mode, last_reset_at, updated_by, updated_at, reset_reason")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Snapshot failed: ${error.message}`);
  return data || null;
}

async function rollbackSystemState(supabase, snapshot) {
  if (!snapshot) return;
  const { error } = await supabase.from("admin_system_state").upsert(
    {
      id: true,
      maintenance_mode: Boolean(snapshot.maintenance_mode),
      last_reset_at: snapshot.last_reset_at || null,
      updated_by: snapshot.updated_by || null,
      updated_at: snapshot.updated_at || new Date().toISOString(),
      reset_reason: snapshot.reset_reason || null,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`Rollback failed: ${error.message}`);
}

async function handleSystemMaintenance(req, res, supabase, actor, body) {
  const enabled = Boolean(body.enabled);
  const reason = String(body.reason || "").trim() || null;
  const now = new Date().toISOString();

  let snapshot = null;
  try {
    snapshot = await getSystemStateSnapshot(supabase);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Could not snapshot system state" });
  }

  const { data, error } = await supabase
    .from("admin_system_state")
    .upsert(
      {
        id: true,
        maintenance_mode: enabled,
        updated_by: actor.id,
        updated_at: now,
        reset_reason: reason,
      },
      { onConflict: "id" }
    )
    .select("maintenance_mode, updated_at, updated_by")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message || "Failed to update maintenance state" });
  }

  try {
    await writeSystemAuditLog(supabase, {
      category: "settings",
      action: "system_maintenance_updated",
      actor_id: actor.id,
      actor_email: actor.email || null,
      actor_name: actor.user_metadata?.full_name || null,
      actor_role: actor.app_metadata?.role || null,
      entity: "system",
      metadata: { enabled, reason },
      description: enabled
        ? "Maintenance mode enabled from danger zone."
        : "Maintenance mode disabled from danger zone.",
      before: snapshot
        ? {
            maintenance_mode: snapshot.maintenance_mode,
            last_reset_at: snapshot.last_reset_at,
            reset_reason: snapshot.reset_reason,
          }
        : null,
      after: { maintenance_mode: enabled, reason },
      created_at: now,
    });
  } catch (auditErr) {
    try {
      await rollbackSystemState(supabase, snapshot);
    } catch (rollbackErr) {
      return res.status(500).json({
        error: `Audit failed and rollback failed: ${auditErr.message}; ${rollbackErr.message}`,
      });
    }
    return res.status(500).json({ error: auditErr.message || "Audit write failed; system change reverted" });
  }

  return res.status(200).json({ ok: true, state: data });
}

async function handleSystemReset(req, res, supabase, actor, body) {
  const reason = String(body.reason || "").trim() || null;
  const now = new Date().toISOString();

  let snapshot = null;
  try {
    snapshot = await getSystemStateSnapshot(supabase);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Could not snapshot system state" });
  }

  const { data, error } = await supabase
    .from("admin_system_state")
    .upsert(
      {
        id: true,
        maintenance_mode: false,
        last_reset_at: now,
        updated_by: actor.id,
        updated_at: now,
        reset_reason: reason,
      },
      { onConflict: "id" }
    )
    .select("maintenance_mode, last_reset_at, updated_at, updated_by")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message || "Failed to reset system state" });
  }

  try {
    await writeSystemAuditLog(supabase, {
      category: "settings",
      action: "system_reset_executed",
      actor_id: actor.id,
      actor_email: actor.email || null,
      actor_name: actor.user_metadata?.full_name || null,
      actor_role: actor.app_metadata?.role || null,
      entity: "system",
      metadata: { reason },
      description: "System reset workflow executed from danger zone.",
      before: snapshot
        ? {
            maintenance_mode: snapshot.maintenance_mode,
            last_reset_at: snapshot.last_reset_at,
            reset_reason: snapshot.reset_reason,
          }
        : null,
      after: { maintenance_mode: false, last_reset_at: now, reason },
      created_at: now,
    });
  } catch (auditErr) {
    try {
      await rollbackSystemState(supabase, snapshot);
    } catch (rollbackErr) {
      return res.status(500).json({
        error: `Audit failed and rollback failed: ${auditErr.message}; ${rollbackErr.message}`,
      });
    }
    return res.status(500).json({ error: auditErr.message || "Audit write failed; system change reverted" });
  }

  return res.status(200).json({ ok: true, state: data });
}

async function handlePostSettings(req, res, supabase, user) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Missing request body" });
  }

  const now = new Date().toISOString();
  const updates = [];
  if (body.settings && typeof body.settings === "object") {
    const s = body.settings;
    if (s.system && typeof s.system === "object") {
      updates.push({ key: "system", value: s.system, updated_by: user.id, updated_at: now });
    }
    if (s.affiliateProgram && typeof s.affiliateProgram === "object") {
      updates.push({ key: "affiliateProgram", value: s.affiliateProgram, updated_by: user.id, updated_at: now });
    }
  } else if (body.key && body.value && typeof body.value === "object") {
    updates.push({
      key: String(body.key).trim(),
      value: body.value,
      updated_by: user.id,
      updated_at: now,
    });
  }

  if (!updates.length) {
    return res.status(400).json({ error: "No valid settings updates supplied" });
  }

  const keys = updates.map((u) => u.key);
  const { data: previousRows, error: previousErr } = await supabase
    .from("admin_settings")
    .select("key, value, updated_by, updated_at")
    .in("key", keys);
  if (previousErr) {
    return res.status(500).json({ error: previousErr.message || "Failed to snapshot previous settings state" });
  }

  const { error } = await supabase.from("admin_settings").upsert(updates, { onConflict: "key" });
  if (error) {
    return res.status(500).json({ error: error.message || "Failed to save admin settings" });
  }

  try {
    await writeSettingsAudit(supabase, user, {
      keys,
      updated_at: now,
    });
  } catch (auditErr) {
    try {
      await rollbackAdminSettingsRows(supabase, previousRows);
    } catch (rollbackErr) {
      return res.status(500).json({
        error: `Audit failed and rollback failed: ${auditErr.message}; ${rollbackErr.message}`,
      });
    }
    return res.status(500).json({ error: auditErr.message || "Audit write failed; settings change reverted" });
  }

  return handleGetSettings(res, supabase);
}

export default async function handler(req, res) {
  try {
    const resource = adminResourceFromRequest(req);
    const adminSubpath = adminSubpathFromRequest(req);
    const systemAction = resource === "system" ? adminSubpath.split("/").slice(1).join("/") : "";
    const getResources = new Set([
      "affiliates",
      "platform-users",
      "platform-user-messages",
      "broadcast-jobs",
      "sync-users",
      "security-events",
      "system-health",
      "settings",
    ]);
    const postResources = new Set([
      "approve",
      "decline",
      "invite-user",
      "clean-orphaned-users",
      "send-platform-message",
      "send-message",
      "broadcast-update",
      "settings",
      "system",
    ]);

    if ((req.method === "POST" || req.method === "OPTIONS") && postResources.has(resource)) {
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
          await ensureGetDeps();
          cors(res, req);
          const { client: supabase, configError } = getSupabaseAdmin();
          if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });
          return handleAffiliateApprovePost(req, res, supabase);
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
        if (resource === "send-message") {
          await ensureSendMessageDeps();
          return handleVercelAdminSendMessagePost(req, res);
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
            const idempotencyKey =
              String(req.headers["x-idempotency-key"] || body?.idempotency_key || body?.idempotencyKey || "").trim();
            const payload = { subject: body?.subject, content: body?.content };
            validateAdminBroadcastPayload(payload);
            const { users } = await fetchMergedPlatformUsersForAdmin(supabase, 2000);
            const result = await broadcastAdminUpdateToAllUsers(
              supabase,
              authData.user.id,
              users,
              payload,
              { idempotencyKey }
            );
            return res.status(200).json({ ok: true, ...result });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const status = /content is required|subject too long|content too long|Invalid sender_id|idempotency key is required/i.test(msg)
              ? 400
              : 500;
            return res.status(status).json({ error: msg });
          }
        }
        if (resource === "settings") {
          await ensureGetDeps();
          cors(res, req);
          const { client: supabase, configError } = getSupabaseAdmin();
          if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

          const authHeader = req.headers.authorization || "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) return res.status(401).json({ error: "Missing bearer token" });
          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

          const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowTeamManagement: true });
          if (deny) return res.status(deny.status).json(deny.body);

          return handlePostSettings(req, res, supabase, authData.user);
        }
        if (resource === "system") {
          await ensureGetDeps();
          cors(res, req);
          const { client: supabase, configError } = getSupabaseAdmin();
          if (!supabase) return res.status(503).json({ error: configError || "Server misconfigured (Supabase)" });

          const authHeader = req.headers.authorization || "";
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
          if (!token) return res.status(401).json({ error: "Missing bearer token" });
          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

          const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowTeamManagement: true });
          if (deny) return res.status(deny.status).json(deny.body);

          const body = parseSystemWorkflowBody(req, res);
          if (!body) return;
          if (!["maintenance", "reset"].includes(systemAction)) {
            return res.status(404).json({ error: "Unknown system action" });
          }
          if (systemAction === "maintenance") {
            return handleSystemMaintenance(req, res, supabase, authData.user, body);
          }
          return handleSystemReset(req, res, supabase, authData.user, body);
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

    const authOpts = resource === "settings"
      ? { allowTeamManagement: true }
      : { allowInternalTeam: true };
    const deny = await assertCallerForAdminRoute(supabase, authData.user, authOpts);
    if (deny) return res.status(deny.status).json(deny.body);

    if (resource === "security-events") {
      return handleSecurityEvents(res);
    }

    if (resource === "system-health") {
      return handleSystemHealth(req, res, supabase);
    }
    if (resource === "broadcast-jobs") {
      return handleBroadcastJobs(req, res, supabase);
    }
    if (resource === "settings") {
      return handleGetSettings(res, supabase);
    }

    if (resource === "sync-users") {
      return handleSyncUsers(req, res, supabase);
    }

    if (resource === "platform-user-messages") {
      const recipientId = String(req.query?.recipient_id ?? "").trim();
      const messageTypeRaw = String(req.query?.message_type ?? "").trim().toLowerCase();
      const messageType = messageTypeRaw || undefined;
      if (messageType && !["direct", "broadcast"].includes(messageType)) {
        return res.status(400).json({ error: "Invalid message_type (use direct or broadcast)" });
      }
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
      const listCursor = String(req.query?.list_cursor || "").trim() || undefined;
      const threadCursor = String(req.query?.thread_cursor || "").trim() || undefined;
      try {
        const data = await getAdminPlatformUserMessages(supabase, {
          recipientId: recipientId || undefined,
          messageType,
          threadLimit,
          listLimit,
          listCursor,
          threadCursor,
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
