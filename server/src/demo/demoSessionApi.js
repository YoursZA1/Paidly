/**
 * Demo Mode session lifecycle. Served by the existing auth function (api/auth/[route].js) — no new
 * Vercel function:
 *
 *   POST /api/auth/demo        start: new demo auth user + provisioned "Mavela Café" workspace → tokens
 *   POST /api/auth/demo-reset  reset the caller's own workspace to the seed (bearer token)
 *   POST /api/auth/demo-end    end the caller's demo now: purge workspace, delete the demo user
 *
 * The browser never chooses an org, a user id or a business: everything is derived from the verified
 * bearer token and the demo_sessions table. The demo password is random, used once server-side to
 * mint a normal Supabase session, and never returned or logged.
 */
import crypto from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getSupabaseAnonClient } from "../supabaseAnon.js";
import { requireBearerUser } from "../billing/httpAuth.js";
import { getClientIp } from "../loginIpRateLimit.js";
import {
  consumeMemoryRateLimit,
  consumePersistedRateLimit,
  isRateLimitPersistEnabled,
} from "../rateLimit/consumeRateLimit.js";
import { logSecurity } from "../securityMiddleware.js";
import { applyApiCors } from "../auth/applyApiCors.js";
import { purgeUserStorageAssets } from "../purgeUserStorage.js";
import { isDemoUserId, logDemo } from "./demoMode.js";

const DEMO_BUSINESS_NAME = "Mavela Café";

function envNumber(name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function demoConfig(env = process.env) {
  const enabled = !/^(0|false|off|no)$/i.test(String(env.PAIDLY_DEMO_ENABLED ?? "").trim());
  return {
    enabled,
    ttlMinutes: envNumber("PAIDLY_DEMO_TTL_MINUTES", 120, { min: 15, max: 1440 }),
    maxActive: envNumber("PAIDLY_DEMO_MAX_ACTIVE", 200, { min: 1, max: 5000 }),
    startsPerIpPerHour: envNumber("PAIDLY_DEMO_START_PER_IP_MAX", 6, { min: 1, max: 1000 }),
    resetsPerHour: envNumber("PAIDLY_DEMO_RESET_PER_HOUR_MAX", 12, { min: 1, max: 1000 }),
    // RFC 2606 reserved domain: mail to it can never reach a person.
    emailDomain: String(env.PAIDLY_DEMO_EMAIL_DOMAIN || "example.com").trim().toLowerCase() || "example.com",
    // Ready workspaces prepared ahead of a click. 0 disables the pool (every start seeds inline).
    poolSize: envNumber("PAIDLY_DEMO_POOL_SIZE", 2, { min: 0, max: 8 }),
  };
}

function jsonError(res, status, error, code, extra = {}) {
  return res.status(status).json({ error, code, ...extra });
}

async function consumeBucket(bucket, max, windowMs) {
  if (isRateLimitPersistEnabled()) return consumePersistedRateLimit(bucket, max, windowMs);
  return consumeMemoryRateLimit("demo", bucket, max, windowMs);
}

function hashClient(ip) {
  const salt = String(process.env.PAIDLY_DEMO_HASH_SALT || "paidly-demo");
  return crypto.createHash("sha256").update(`${salt}:${ip || "unknown"}`).digest("hex").slice(0, 32);
}

function preflight(req, res, method = "POST") {
  applyApiCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return false;
  }
  if (req.method !== method) {
    res.setHeader("Allow", `${method}, OPTIONS`);
    jsonError(res, 405, "Method not allowed", "METHOD_NOT_ALLOWED");
    return false;
  }
  return true;
}

/** Removes files a demo visitor uploaded (logos, product photos, receipts). Best-effort, bounded. */
async function purgeDemoStorage(userId, orgId) {
  try {
    await purgeUserStorageAssets(supabaseAdmin, userId);
  } catch {
    /* logged inside */
  }
  const prefixes = [
    ["paidly", `inventory/${userId}`],
    ["paidly", `document-logos/${userId}`],
    ["receipts", orgId ? String(orgId) : ""],
  ];
  for (const [bucket, prefix] of prefixes) {
    if (!prefix) continue;
    try {
      const { data } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 100 });
      const paths = (data || []).filter((f) => f?.name).map((f) => `${prefix}/${f.name}`);
      if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths);
    } catch {
      /* bucket may not exist in every environment */
    }
  }
}

async function deleteDemoAuthUser(userId) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error && !/not.?found/i.test(error.message || "")) throw error;
}

/**
 * Deletes expired demo workspaces and their auth users. Called by the demo-cleanup cron and,
 * opportunistically (small batch), whenever a new demo starts — so the database stays bounded even
 * between daily cron runs.
 * @returns {Promise<{ purged: number, usersDeleted: number, failed: number }>}
 */
export async function runDemoCleanup({ limit = 25 } = {}) {
  const { data, error } = await supabaseAdmin.rpc("purge_expired_demo_workspaces", { p_limit: limit });
  if (error) throw error;
  let usersDeleted = 0;
  let failed = 0;
  for (const row of data || []) {
    try {
      await purgeDemoStorage(row.user_id, row.org_id);
      await deleteDemoAuthUser(row.user_id);
      usersDeleted += 1;
    } catch (err) {
      failed += 1;
      logDemo("demo_cleanup_user_failed", { message: err?.message || String(err) });
    }
  }
  const out = { purged: (data || []).length, usersDeleted, failed };
  if (out.purged) logDemo("demo_cleanup", out);
  return out;
}

async function rollbackDemoUser(userId) {
  try {
    await supabaseAdmin.rpc("purge_demo_workspace", { p_user_id: userId });
  } catch {
    /* nothing provisioned yet */
  }
  try {
    await deleteDemoAuthUser(userId);
  } catch (err) {
    logDemo("demo_rollback_failed", { message: err?.message || String(err) });
  }
}

async function signInDemo(email, password) {
  const anon = getSupabaseAnonClient();
  if (!anon) {
    const err = new Error("no_supabase_anon");
    err.code = "DEMO_UNAVAILABLE";
    throw err;
  }
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  const session = signIn?.session;
  if (signInError || !session?.access_token || !session?.refresh_token) {
    throw signInError || new Error("demo sign-in returned no session");
  }
  return session;
}

async function createDemoAuthUser(config) {
  const handle = crypto.randomBytes(9).toString("hex");
  const email = `demo-${handle}@${config.emailDomain}`;
  const password = crypto.randomBytes(32).toString("base64url");
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // pending_company_invite: handle_new_user makes the profile only — the demo org comes from
    // provision_demo_workspace, never from a trial signup.
    user_metadata: { pending_company_invite: "true", full_name: "Thabo Mavela" },
    app_metadata: { paidly_demo: true },
  });
  if (createError || !created?.user?.id) throw createError || new Error("createUser returned no user");
  return { userId: created.user.id, email, password };
}

/**
 * Takes one prepared workspace, rotates its password, and signs in. Returns null when the pool is
 * empty or the prepared user cannot be signed in (that slot is rolled back). The browser never
 * supplies the user or the business.
 */
async function startFromPreparedWorkspace(config, clientHash) {
  const { data, error } = await supabaseAdmin.rpc("claim_pooled_demo_workspace", {
    p_ttl_minutes: config.ttlMinutes,
    p_client_hash: clientHash,
  });
  if (error) {
    logDemo("demo_pool_claim_unavailable", { message: error.message });
    return null;
  }
  if (!data?.user_id || !data?.email) return null;

  const password = crypto.randomBytes(32).toString("base64url");
  try {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password });
    if (updateError) throw updateError;
    const session = await signInDemo(data.email, password);
    return { session, demo: data, userId: data.user_id, pooled: true };
  } catch (err) {
    logDemo("demo_pool_claim_signin_failed", { message: err?.message || String(err) });
    await rollbackDemoUser(data.user_id);
    return null;
  }
}

async function startFreshWorkspace(config, clientHash) {
  const { data: active, error: countError } = await supabaseAdmin.rpc("demo_active_workspace_count");
  if (countError) {
    logDemo("demo_start_failed", { stage: "count", message: countError.message });
    const err = new Error("count");
    err.code = "DEMO_UNAVAILABLE";
    throw err;
  }
  if (Number(active) >= config.maxActive) {
    logDemo("demo_start_capacity", { active: Number(active), max: config.maxActive });
    const err = new Error("busy");
    err.code = "DEMO_BUSY";
    throw err;
  }

  const created = await createDemoAuthUser(config);
  try {
    const { data: workspace, error: provisionError } = await supabaseAdmin.rpc("provision_demo_workspace", {
      p_user_id: created.userId,
      p_ttl_minutes: config.ttlMinutes,
      p_client_hash: clientHash,
    });
    if (provisionError) throw provisionError;
    const session = await signInDemo(created.email, created.password);
    return { session, demo: workspace, userId: created.userId, pooled: false };
  } catch (err) {
    await rollbackDemoUser(created.userId);
    throw err;
  }
}

/** Prepares one workspace with no visitor attached. Password is discarded until claim rotates it. */
async function provisionPooledWorkspace(config) {
  let userId = null;
  try {
    const created = await createDemoAuthUser(config);
    userId = created.userId;
    const { error } = await supabaseAdmin.rpc("provision_demo_workspace", {
      p_user_id: userId,
      p_ttl_minutes: config.ttlMinutes,
      p_client_hash: "pool",
      p_for_pool: true,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    logDemo("demo_pool_refill_failed", { message: err?.message || String(err) });
    if (userId) await rollbackDemoUser(userId);
    return false;
  }
}

/**
 * Tops the pool back up. Bounded so one invocation cannot seed an unbounded number of cafés.
 * @returns {Promise<{ added: number }>}
 */
export async function replenishDemoPool({ maxAdd = 1 } = {}) {
  const config = demoConfig();
  if (!config.enabled || config.poolSize <= 0) return { added: 0 };
  const { data: available, error } = await supabaseAdmin.rpc("demo_pool_available_count");
  if (error) {
    logDemo("demo_pool_count_failed", { message: error.message });
    return { added: 0 };
  }
  const room = config.poolSize - Number(available || 0);
  const toAdd = Math.max(0, Math.min(room, maxAdd));
  if (!toAdd) return { added: 0 };

  const { data: active, error: countError } = await supabaseAdmin.rpc("demo_active_workspace_count");
  if (countError) {
    logDemo("demo_pool_count_failed", { message: countError.message });
    return { added: 0 };
  }

  let added = 0;
  for (let i = 0; i < toAdd; i += 1) {
    if (Number(active) + added >= config.maxActive) break;
    const ok = await provisionPooledWorkspace(config);
    if (!ok) break;
    added += 1;
  }
  if (added) logDemo("demo_pool_refilled", { added, target: config.poolSize });
  return { added };
}

/** Expired-demo sweep plus one pool refill. Not on the visitor's critical path. */
export async function runDemoMaintenance() {
  try {
    await runDemoCleanup({ limit: 2 });
  } catch (err) {
    logDemo("demo_cleanup_inline_failed", { message: err?.message || String(err) });
  }
  try {
    await replenishDemoPool({ maxAdd: 1 });
  } catch (err) {
    logDemo("demo_pool_refill_failed", { message: err?.message || String(err) });
  }
}

function scheduleDemoMaintenance() {
  // Registered while the request is still open so Vercel can keep the refill alive after
  // res.json(). The promise is not awaited. Tests call runDemoMaintenance directly.
  if (process.env.VITEST) return;
  const work = runDemoMaintenance();
  try {
    waitUntil(work);
  } catch {
    /* outside a Vercel request the promise still runs in a long-lived server */
  }
}

function sendDemoSession(res, pack, { ttlMinutes, clientHash, startedAt }) {
  logDemo("demo_session_created", {
    user: String(pack.userId || "").slice(0, 8),
    ttl_minutes: ttlMinutes,
    client: clientHash.slice(0, 8),
    pooled: pack.pooled === true,
    ms: Date.now() - startedAt,
  });
  return res.status(201).json({
    ok: true,
    access_token: pack.session.access_token,
    refresh_token: pack.session.refresh_token,
    demo: {
      business_name: pack.demo?.business_name || DEMO_BUSINESS_NAME,
      expires_at: pack.demo?.expires_at || null,
    },
  });
}

/** POST /api/auth/demo */
export async function handleDemoStart(req, res) {
  if (!preflight(req, res)) return;
  const config = demoConfig();
  if (!config.enabled) {
    return jsonError(res, 503, "The live demo is not available right now.", "DEMO_DISABLED");
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const ip = getClientIp(req);
  if (body.hp) {
    logSecurity("warn", "honeypot_triggered", { ip, path: "/api/auth/demo" });
    return jsonError(res, 400, "Invalid request", "INVALID_REQUEST");
  }

  const slot = await consumeBucket(`demo:start:${ip || "unknown"}`, config.startsPerIpPerHour, 60 * 60 * 1000);
  if (!slot.ok) {
    logSecurity("warn", "demo_start_rate_limited", { ip, retryAfterSeconds: slot.retryAfterSeconds });
    res.setHeader("Retry-After", String(slot.retryAfterSeconds));
    return jsonError(res, 429, "You've started several demos recently. Please try again a little later.", "DEMO_RATE_LIMITED", {
      retryAfterSeconds: slot.retryAfterSeconds,
    });
  }

  if (!getSupabaseAnonClient()) {
    logDemo("demo_start_misconfigured", { reason: "no_supabase_anon" });
    return jsonError(res, 503, "The live demo is not available right now.", "DEMO_UNAVAILABLE");
  }

  const startedAt = Date.now();
  const clientHash = hashClient(ip);
  try {
    // A prepared workspace is only a password rotation and a sign-in. Seeding happens off this request.
    const pack =
      (await startFromPreparedWorkspace(config, clientHash)) || (await startFreshWorkspace(config, clientHash));
    scheduleDemoMaintenance();
    return sendDemoSession(res, pack, { ttlMinutes: config.ttlMinutes, clientHash, startedAt });
  } catch (err) {
    if (err?.code === "DEMO_BUSY") {
      return jsonError(res, 503, "The live demo is very busy right now. Please try again in a few minutes.", "DEMO_BUSY");
    }
    if (err?.code === "DEMO_UNAVAILABLE") {
      return jsonError(res, 503, "The live demo is not available right now.", "DEMO_UNAVAILABLE");
    }
    logDemo("demo_start_failed", { stage: "provision", message: err?.message || String(err) });
    return jsonError(res, 500, "We couldn't start the demo. Please try again.", "DEMO_START_FAILED");
  }
}

async function requireDemoCaller(req, res) {
  const auth = await requireBearerUser(req, supabaseAdmin);
  if (auth.error) {
    jsonError(res, auth.status, auth.status === 401 ? "Your demo session has ended." : auth.error, "DEMO_SESSION_INVALID");
    return null;
  }
  let demo = false;
  try {
    demo = await isDemoUserId(auth.user.id);
  } catch {
    demo = false;
  }
  if (!demo) {
    logSecurity("warn", "demo_endpoint_non_demo_user", { path: req.url?.split("?")[0] || "" });
    jsonError(res, 403, "This action is only available in Demo Mode.", "NOT_A_DEMO_SESSION");
    return null;
  }
  return auth.user;
}

/** POST /api/auth/demo-reset */
export async function handleDemoReset(req, res) {
  if (!preflight(req, res)) return;
  const user = await requireDemoCaller(req, res);
  if (!user) return;

  const config = demoConfig();
  const slot = await consumeBucket(`demo:reset:${user.id}`, config.resetsPerHour, 60 * 60 * 1000);
  if (!slot.ok) {
    res.setHeader("Retry-After", String(slot.retryAfterSeconds));
    return jsonError(res, 429, "The demo was reset several times recently. Please try again shortly.", "DEMO_RATE_LIMITED", {
      retryAfterSeconds: slot.retryAfterSeconds,
    });
  }

  const started = Date.now();
  const { data, error } = await supabaseAdmin.rpc("reset_demo_workspace", { p_user_id: user.id });
  if (error) {
    const hint = `${error.hint || ""} ${error.message || ""}`;
    logDemo("demo_reset_failed", { user: user.id.slice(0, 8), message: error.message });
    if (/DEMO_SESSION_EXPIRED/.test(hint)) {
      return jsonError(res, 410, "This demo has expired. Start a fresh demo to keep exploring.", "DEMO_SESSION_EXPIRED");
    }
    if (/DEMO_SESSION_NOT_FOUND/.test(hint)) {
      return jsonError(res, 404, "This demo session could not be found.", "DEMO_SESSION_NOT_FOUND");
    }
    return jsonError(res, 500, "We couldn't reset the demo. Please try again.", "DEMO_RESET_FAILED");
  }
  logDemo("demo_reset", { user: user.id.slice(0, 8), ms: Date.now() - started });
  return res.status(200).json({ ok: true, demo: { expires_at: data?.expires_at || null, business_name: DEMO_BUSINESS_NAME } });
}

/** POST /api/auth/demo-end */
export async function handleDemoEnd(req, res) {
  if (!preflight(req, res)) return;
  const user = await requireDemoCaller(req, res);
  if (!user) return;
  try {
    const { data: orgId, error } = await supabaseAdmin.rpc("purge_demo_workspace", { p_user_id: user.id });
    if (error) throw error;
    await purgeDemoStorage(user.id, orgId);
    await deleteDemoAuthUser(user.id);
    logDemo("demo_session_ended", { user: user.id.slice(0, 8) });
    return res.status(200).json({ ok: true });
  } catch (err) {
    // The expiry sweep removes it later; the visitor is signed out either way.
    logDemo("demo_end_failed", { user: user.id.slice(0, 8), message: err?.message || String(err) });
    return res.status(202).json({ ok: true, deferred: true });
  }
}
