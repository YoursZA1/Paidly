/**
 * Demo Mode — server-side identity and guard helpers.
 *
 * A demo visitor is an ordinary Supabase user who owns exactly one organization flagged `is_demo`
 * (see supabase/migrations/20261001120000_demo_mode.sql). Tenant isolation is the normal per-org RLS;
 * these helpers add the Demo Mode *behaviour*: no real communications, no real payments, no
 * administration. Never decide "is demo" from anything the browser sends — only from the database.
 */
import { supabaseAdmin } from "../supabaseAdmin.js";
import { logSecurity } from "../securityMiddleware.js";

export const DEMO_MODE_RESTRICTED = "DEMO_MODE_RESTRICTED";
export const DEMO_MESSAGE_NOT_SENT = "Demo Mode — message not sent.";

const CACHE_TTL_MS = 60_000;
const orgCache = new Map();

function missingDemoColumn(error) {
  const msg = String(error?.message || "");
  return error?.code === "42703" || /is_demo|demo_sessions|does not exist|schema cache/i.test(msg);
}

/**
 * @param {string | null | undefined} orgId
 * @param {{ client?: import("@supabase/supabase-js").SupabaseClient }} [opts]
 * @returns {Promise<boolean>}
 */
export async function isDemoOrgId(orgId, { client = supabaseAdmin } = {}) {
  const id = String(orgId || "").trim();
  if (!id) return false;
  const cached = orgCache.get(id);
  if (cached && cached.at > Date.now() - CACHE_TTL_MS) return cached.demo;
  const { data, error } = await client.from("organizations").select("is_demo").eq("id", id).maybeSingle();
  if (error) {
    // Before the migration is applied nothing is a demo org.
    if (missingDemoColumn(error)) return false;
    throw error;
  }
  const demo = Boolean(data?.is_demo);
  orgCache.set(id, { demo, at: Date.now() });
  if (orgCache.size > 5000) orgCache.clear();
  return demo;
}

/** @param {string | null | undefined} userId */
export async function isDemoUserId(userId, { client = supabaseAdmin } = {}) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const { data, error } = await client.from("demo_sessions").select("user_id").eq("user_id", id).maybeSingle();
  if (error) {
    if (missingDemoColumn(error)) return false;
    throw error;
  }
  return Boolean(data?.user_id);
}

/**
 * Demo status of a resolved company membership (loadCompanyMembership sets `isDemo`), falling back to
 * a lookup by org id.
 */
export async function isDemoMembership(membership) {
  if (!membership) return false;
  if (typeof membership.isDemo === "boolean") return membership.isDemo;
  return isDemoOrgId(membership.orgId || membership.companyId);
}

/** Test hook. */
export function clearDemoOrgCache() {
  orgCache.clear();
}

/**
 * Structured, secret-free log line for Demo Mode events (session, reset, payment simulation, cleanup,
 * authorization refusals). Never pass tokens, passwords, emails or customer data.
 */
export function logDemo(event, data = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (/token|password|secret|key|email|authorization/i.test(key)) continue;
    safe[key] = typeof value === "string" ? value.slice(0, 120) : value;
  }
  console.info(JSON.stringify({ at: new Date().toISOString(), scope: "demo", event, ...safe }));
}

/**
 * 403 for a capability that needs a real account (billing, invites, integrations, API keys…).
 * @param {import("express").Response} res
 * @param {string} feature human-readable, e.g. "Subscription management"
 */
export function sendDemoRestricted(res, feature, extra = {}) {
  logSecurity("info", "demo_restricted_action", { feature: String(feature || "").slice(0, 80) });
  return res.status(403).json({
    error: `Demo Mode — ${feature || "this feature"} requires a real Paidly account.`,
    code: DEMO_MODE_RESTRICTED,
    demo: true,
    ...extra,
  });
}

/**
 * The action "succeeds" from the product's point of view but nothing leaves Paidly. Returns a preview
 * of what would have been sent so the prospect still understands the workflow.
 * @param {import("express").Response} res
 * @param {{ channel?: string, to?: string | null, subject?: string | null, kind?: string, extra?: object }} info
 */
export function sendDemoNotSent(res, { channel = "email", to = null, subject = null, kind = "message", extra = {} } = {}) {
  logDemo("demo_message_suppressed", { channel, kind });
  return res.status(200).json({
    ok: true,
    success: true,
    demo: true,
    sent: false,
    code: "DEMO_MESSAGE_NOT_SENT",
    message: DEMO_MESSAGE_NOT_SENT,
    preview: { channel, to: to ? String(to).slice(0, 254) : null, subject: subject ? String(subject).slice(0, 200) : null, kind },
    ...extra,
  });
}

/** Result object for internal senders (no HTTP response in scope). */
export function demoNotSentResult({ channel = "email", kind = "message" } = {}) {
  logDemo("demo_message_suppressed", { channel, kind });
  return { success: false, demo: true, sent: false, skipped: true, reason: "demo_mode", message: DEMO_MESSAGE_NOT_SENT };
}

/**
 * For internal senders (crons, notifications, receipts): true when the org is a demo workspace, in
 * which case the caller must skip the external send. Logs the suppression. Fails closed only for demo
 * detection errors on known-demo lookups — an unreachable database suppresses nothing here because
 * the send itself would fail the same way.
 * @param {string | null | undefined} orgId
 * @param {string} kind e.g. "payment_reminder"
 */
export async function suppressForDemoOrg(orgId, kind = "message", channel = "email") {
  if (!orgId) return false;
  let demo = false;
  try {
    demo = await isDemoOrgId(orgId);
  } catch {
    demo = false;
  }
  if (demo) logDemo("demo_message_suppressed", { channel, kind });
  return demo;
}

/** Error for flows that cannot run in Demo Mode (maps to HTTP 403 through err.status / err.code). */
export function demoRestrictedError(feature) {
  const err = new Error(`Demo Mode — ${feature || "this action"} requires a real Paidly account.`);
  err.status = 403;
  err.code = DEMO_MODE_RESTRICTED;
  err.demo = true;
  return err;
}
