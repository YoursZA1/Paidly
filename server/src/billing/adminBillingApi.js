import { getBillingSupabaseAdmin } from "./supabaseAdmin.js";
import { requireBearerUser } from "./httpAuth.js";
import { assertCallerForAdminRoute } from "../adminRouteAccess.js";
import { isValidEmail, isValidUuid } from "../inputValidation.js";
import { resolveCurrentCatalogAssignment, isLegacyPlanSlug } from "../subscriptionPlans.js";
import { PAYMENT_HISTORY_STATUS } from "../../../shared/paymentHistoryStatuses.js";
import {
  SUBSCRIPTION_STATUS,
  coerceSubscriptionStatus,
} from "../../../shared/subscriptionStatuses.js";
import {
  SUBSCRIPTION_EVENT_LABELS,
  SUBSCRIPTION_EVENT_TYPE,
  buildSubscriptionEventTimeline,
} from "../../../shared/subscriptionEventTypes.js";
import {
  PAYMENT_REPORTING_START_ISO,
  SUBSCRIPTION_SOURCE,
} from "../../../shared/subscriptionAccess.js";
import {
  getRevenueSince,
  reportingPaymentLabel,
  paymentEffectiveAt,
} from "../../../shared/billingReporting.js";
import {
  buildAdminOverridePatch,
  coerceAdminRequestedStatus,
} from "./adminSubscriptionOverride.js";

function json(res, status, body) {
  return res.status(status).json(body);
}

/**
 * Admin dashboard “Subscription Overview” buckets (UI labels → DB status values).
 * Trial → trialing; Pending includes processing (checkout in flight).
 */
const OVERVIEW_BUCKETS = Object.freeze([
  { key: "active", label: "Active", statuses: [SUBSCRIPTION_STATUS.ACTIVE] },
  {
    key: "pending",
    label: "Pending",
    statuses: [SUBSCRIPTION_STATUS.PENDING, SUBSCRIPTION_STATUS.PROCESSING],
  },
  { key: "expired", label: "Expired", statuses: [SUBSCRIPTION_STATUS.EXPIRED] },
  {
    key: "cancelled",
    label: "Cancelled",
    statuses: [SUBSCRIPTION_STATUS.CANCELLED, "canceled"],
  },
  {
    key: "trial",
    label: "Trial",
    statuses: [SUBSCRIPTION_STATUS.TRIALING, "trial"],
  },
  { key: "pastDue", label: "Past Due", statuses: [SUBSCRIPTION_STATUS.PAST_DUE] },
  { key: "failed", label: "Failed", statuses: [SUBSCRIPTION_STATUS.FAILED] },
]);

async function countSubscriptionsInStatuses(supabase, statuses) {
  const { count, error } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .in("status", statuses);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Exact head counts per overview bucket (not derived from a limited list page).
 */
export async function buildSubscriptionOverview(supabase) {
  const counts = {};
  let total = 0;
  await Promise.all(
    OVERVIEW_BUCKETS.map(async (bucket) => {
      const n = await countSubscriptionsInStatuses(supabase, bucket.statuses);
      counts[bucket.key] = n;
      total += n;
    })
  );

  const { count: allCount, error: allErr } = await supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true });
  if (allErr) throw allErr;

  let adminGranted = 0;
  try {
    const { count: agCount, error: agErr } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
      .eq("subscription_source", SUBSCRIPTION_SOURCE.ADMIN);
    if (!agErr) adminGranted = agCount ?? 0;
  } catch {
    adminGranted = 0;
  }
  counts.adminGranted = adminGranted;

  return {
    active: counts.active || 0,
    pending: counts.pending || 0,
    expired: counts.expired || 0,
    cancelled: counts.cancelled || 0,
    trial: counts.trial || 0,
    pastDue: counts.pastDue || 0,
    failed: counts.failed || 0,
    adminGranted,
    /** Sum of overview buckets (may be less than all rows when other statuses exist). */
    bucketTotal: total,
    /** All rows in `subscriptions`. */
    total: allCount ?? total,
    buckets: OVERVIEW_BUCKETS.filter((b) => b.key !== "adminGranted").map((b) => ({
      key: b.key,
      label: b.label,
      count: counts[b.key] || 0,
    })),
  };
}

/**
 * Payment/revenue KPIs from verified payment_history, epoch 2026-08-20 UTC.
 * Active/trial/expired counts come from subscriptions, not from payment rows.
 */
export async function buildBillingReporting(supabase, now = new Date()) {
  const startIso = PAYMENT_REPORTING_START_ISO;
  const nowIso = now.toISOString();

  const completedRows = await fetchPaymentRowsSince(supabase, {
    status: PAYMENT_HISTORY_STATUS.COMPLETED,
    sinceIso: startIso,
  });
  const revenue = getRevenueSince(completedRows, startIso);

  let trialUsers = 0;
  try {
    const { count, error } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", [SUBSCRIPTION_STATUS.TRIALING, "trial"])
      .or(`trial_ends_at.is.null,trial_ends_at.gt.${nowIso}`);
    if (!error) trialUsers = count ?? 0;
  } catch {
    trialUsers = await countSubscriptionsInStatuses(supabase, [SUBSCRIPTION_STATUS.TRIALING, "trial"]);
  }

  const [activeSubscribers, expiredStatus] = await Promise.all([
    countSubscriptionsInStatuses(supabase, [SUBSCRIPTION_STATUS.ACTIVE]),
    countSubscriptionsInStatuses(supabase, [SUBSCRIPTION_STATUS.EXPIRED]),
  ]);

  let overdueTrials = 0;
  try {
    const { count, error } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .in("status", [SUBSCRIPTION_STATUS.TRIALING, "trial"])
      .lt("trial_ends_at", nowIso)
      .eq("admin_override", false);
    if (!error) overdueTrials = count ?? 0;
  } catch {
    overdueTrials = 0;
  }

  return {
    startDate: startIso,
    timezone: "UTC",
    successfulPayments: revenue.count,
    revenue: revenue.amount,
    currency: revenue.currency,
    activeSubscribers,
    trialUsers,
    expiredTrials: expiredStatus + overdueTrials,
  };
}

async function requireBillingAdmin(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) {
    json(res, 503, { error: "Server misconfigured" });
    return null;
  }
  const auth = await requireBearerUser(req, supabase);
  if (auth.error) {
    json(res, auth.status, { error: auth.error });
    return null;
  }
  const denied = await assertCallerForAdminRoute(supabase, auth.user, {
    allowInternalTeam: true,
  });
  if (denied) {
    json(res, denied.status, denied.body);
    return null;
  }
  return { supabase, user: auth.user };
}

const LIST_SELECT_RICH =
  "id, status, plan, current_plan, plan_slug, plan_family, amount, custom_price, currency, billing_cycle, company_id, user_id, email, user_email, user_name, full_name, start_date, next_billing_date, activated_at, cancelled_at, failure_count, trial_started_at, trial_ends_at, subscription_source, admin_override, created_at, updated_at";
const LIST_SELECT_LEAN =
  "id, status, plan_slug, plan, amount, currency, billing_cycle, company_id, user_id, email, next_billing_date, cancelled_at, failure_count, created_at, updated_at";

/** Shape admin list rows like EntityManager Subscription so existing UI keeps working. */
export function normalizeAdminSubscriptionListRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    user_email: row.user_email || row.email || "",
    user_name: row.user_name || row.full_name || "",
    plan: row.plan || row.current_plan || row.plan_slug || "starter",
    amount: Number(row.amount ?? row.custom_price ?? 0),
    status: row.status || "active",
    billing_cycle: row.billing_cycle || "monthly",
    next_billing_date: row.next_billing_date || null,
    created_date: row.created_date || row.created_at || null,
    needs_plan_migration: isLegacyPlanSlug(row.plan || row.current_plan || row.plan_slug),
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeBillingCycle(raw) {
  const c = String(raw || "").trim().toLowerCase();
  if (!c) return null;
  if (c === "yearly" || c === "annually") return "annual";
  if (c === "semi_annual" || c === "semiannual") return "biannual";
  if (["monthly", "annual", "quarterly", "biannual"].includes(c)) return c;
  return null;
}

/**
 * Sanitize admin create/update body. Never accept PayFast tokens or status invention.
 * @param {object} body
 * @param {{ isCreate?: boolean }} [opts]
 */
export function buildAdminSubscriptionWriteRow(body, opts = {}) {
  const isCreate = Boolean(opts.isCreate);
  const src = body && typeof body === "object" ? body : {};
  const out = {};

  if (src.user_id != null && String(src.user_id).trim()) {
    const uid = String(src.user_id).trim();
    if (!isValidUuid(uid)) throw httpError(400, "invalid user_id");
    out.user_id = uid;
  } else if (isCreate) {
    out.user_id = null;
  }

  if (src.company_id != null && String(src.company_id).trim()) {
    const cid = String(src.company_id).trim();
    if (!isValidUuid(cid)) throw httpError(400, "invalid company_id");
    out.company_id = cid;
  }

  const emailRaw = String(src.email || src.user_email || "").trim().toLowerCase();
  if (emailRaw) {
    if (!isValidEmail(emailRaw)) throw httpError(400, "invalid email");
    out.email = emailRaw;
    out.user_email = emailRaw;
  } else if (isCreate) {
    throw httpError(400, "email is required");
  }

  const name = String(src.full_name || src.user_name || "").trim();
  if (name) {
    out.full_name = name.slice(0, 200);
    out.user_name = name.slice(0, 200);
  }

  const planRaw = String(src.plan || src.current_plan || src.plan_slug || "")
    .trim()
    .toLowerCase();
  const cycleFromBody = normalizeBillingCycle(src.billing_cycle);
  if (src.billing_cycle != null && String(src.billing_cycle).trim() && !cycleFromBody) {
    throw httpError(400, "invalid billing_cycle");
  }
  if (cycleFromBody && cycleFromBody !== "monthly" && cycleFromBody !== "annual") {
    throw httpError(400, "billing_cycle must be monthly or annual");
  }
  if (cycleFromBody) out.billing_cycle = cycleFromBody;

  if (isCreate && !planRaw) {
    throw httpError(400, "plan is required");
  }

  if (planRaw) {
    const assignment = resolveCurrentCatalogAssignment({
      plan: planRaw,
      billing_cycle: cycleFromBody || src.billing_cycle,
    });
    if (!assignment) {
      throw httpError(400, "plan must be a current Paidly catalog plan (Starter, Business, Growth, or Enterprise)");
    }
    if (assignment.family === "enterprise" && cycleFromBody === "annual") {
      throw httpError(400, "Enterprise is custom billing and cannot use annual list prices");
    }
    out.plan = assignment.family;
    out.current_plan = assignment.family;
    out.plan_slug = assignment.slug;
    out.plan_family = assignment.family;
    out.billing_cycle = assignment.billing_cycle;

    const catalogAmount = assignment.amount;
    if (src.amount != null && src.amount !== "") {
      const n = Number(src.amount);
      if (!Number.isFinite(n) || n < 0) throw httpError(400, "invalid amount");
      const submitted = Math.round(n * 100) / 100;
      if (assignment.contact_sales) {
        if (submitted !== 0) {
          throw httpError(400, "Enterprise is custom — do not submit a list price");
        }
        out.amount = 0;
      } else if (submitted !== catalogAmount) {
        throw httpError(400, "amount must match the canonical catalog price for this plan");
      } else {
        out.amount = catalogAmount;
      }
    } else {
      out.amount = catalogAmount;
    }
  } else if (src.amount != null && src.amount !== "") {
    throw httpError(400, "amount cannot be set without a current catalog plan");
  }

  if (src.status != null && String(src.status).trim()) {
    const st = coerceAdminRequestedStatus(src.status) || coerceSubscriptionStatus(src.status);
    if (!st) throw httpError(400, "invalid subscription status");
    out.status = st;
  } else if (isCreate) {
    out.status = SUBSCRIPTION_STATUS.ACTIVE;
  }

  if (src.currency != null && String(src.currency).trim()) {
    out.currency = String(src.currency).trim().toUpperCase().slice(0, 8);
  } else if (isCreate) {
    out.currency = "ZAR";
  }

  const parseDate = (v) => {
    if (v == null || v === "") return null;
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) throw httpError(400, "invalid date");
    return d.toISOString();
  };
  if (Object.prototype.hasOwnProperty.call(src, "start_date")) {
    out.start_date = parseDate(src.start_date);
  }
  if (Object.prototype.hasOwnProperty.call(src, "next_billing_date")) {
    out.next_billing_date = parseDate(src.next_billing_date);
  }
  if (Object.prototype.hasOwnProperty.call(src, "trial_ends_at")) {
    out.trial_ends_at = parseDate(src.trial_ends_at);
  }
  if (Object.prototype.hasOwnProperty.call(src, "trial_started_at")) {
    out.trial_started_at = parseDate(src.trial_started_at);
  }
  if (Object.prototype.hasOwnProperty.call(src, "expires_at")) {
    out.expires_at = parseDate(src.expires_at);
  }

  return out;
}

async function attachPlanId(supabase, row) {
  const slug = row.plan_slug;
  if (!slug) return row;
  const { data: plan } = await supabase
    .from("plans")
    .select("id, slug, plan_family, is_legacy, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (plan?.id && !plan.is_legacy) {
    row.plan_id = plan.id;
    if (!row.plan_family && plan.plan_family) row.plan_family = plan.plan_family;
  }
  return row;
}

async function attachCompanyId(supabase, row) {
  if (row.company_id || !row.user_id) return row;
  const { data: mem } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", row.user_id)
    .limit(1)
    .maybeSingle();
  if (mem?.org_id) row.company_id = mem.org_id;
  return row;
}

async function logAdminSubscriptionEvent(supabase, subscriptionId, companyId, eventType, details) {
  try {
    await supabase.from("subscription_events").insert({
      subscription_id: subscriptionId,
      company_id: companyId || null,
      event_type: eventType,
      source: "admin",
      details: details || {},
    });
  } catch (e) {
    console.warn("[admin/subscriptions] event insert failed", e?.message || e);
  }
}

function parseJsonBody(req) {
  const b = req.body;
  if (b && typeof b === "object" && !Buffer.isBuffer(b)) return b;
  if (typeof b === "string" && b.trim()) {
    try {
      return JSON.parse(b);
    } catch {
      return null;
    }
  }
  return {};
}

/**
 * GET /api/admin/subscriptions?id=
 * Subscription Details: Company, Owner, Plan, PayFast ID, Renew Date + History / Logs / Invoices.
 */
export async function handleAdminSubscriptionDetail(req, res, subscriptionId) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const id = String(subscriptionId || "").trim();
  if (!id) return json(res, 400, { error: "subscription id required" });

  let { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select(
      "id, status, plan_id, plan_slug, plan, current_plan, amount, currency, billing_cycle, company_id, user_id, email, payfast_token, payfast_subscription_id, payfast_payment_id, m_payment_id, next_billing_date, current_period_end, expires_at, activated_at, started_at, cancelled_at, failure_count, trial_started_at, trial_ends_at, subscription_source, admin_override, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (subErr) {
    // Older column surface: retry with a lean select
    ({ data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select(
        "id, status, plan_id, plan_slug, plan, amount, currency, company_id, user_id, email, payfast_token, payfast_subscription_id, payfast_payment_id, next_billing_date, cancelled_at, failure_count, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle());
  }

  if (subErr) {
    console.error("[admin/subscriptions/detail]", subErr);
    return json(res, 500, { error: "Failed to load subscription" });
  }
  if (!sub) return json(res, 404, { error: "Subscription not found" });

  let company = null;
  if (sub.company_id) {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, owner_id")
      .eq("id", sub.company_id)
      .maybeSingle();
    company = org || null;
  }

  const ownerUserId = company?.owner_id || sub.user_id || null;
  let owner = null;
  if (ownerUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, created_at")
      .eq("id", ownerUserId)
      .maybeSingle();
    owner = profile
      ? {
          id: profile.id,
          name: profile.full_name || null,
          email: profile.email || sub.email || null,
          createdAt: profile.created_at || null,
        }
      : {
          id: ownerUserId,
          name: null,
          email: sub.email || null,
        };
  } else if (sub.email) {
    owner = { id: null, name: null, email: sub.email };
  }

  let planName = null;
  let planSlug = sub.plan_slug || sub.plan || sub.current_plan || null;
  let planAmount = sub.amount != null ? Number(sub.amount) : null;
  let planBillingCycle = sub.billing_cycle || null;
  if (sub.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("id, slug, name, amount, billing_cycle, currency")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (plan) {
      planName = plan.name || null;
      planSlug = plan.slug || planSlug;
      if (plan.amount != null) planAmount = Number(plan.amount);
      planBillingCycle = plan.billing_cycle || planBillingCycle;
    }
  }

  const payfastId =
    sub.payfast_subscription_id ||
    sub.payfast_payment_id ||
    sub.payfast_token ||
    sub.m_payment_id ||
    null;

  const renewDate = sub.next_billing_date || sub.current_period_end || null;

  const [historyRes, eventsRes, invoicesRes] = await Promise.all([
    supabase
      .from("payment_history")
      .select(
        "id, amount, currency, payment_status, payment_method, payfast_payment_id, transaction_date, created_at"
      )
      .eq("subscription_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("subscription_events")
      .select("id, event_type, source, details, created_at, company_id")
      .eq("subscription_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("subscription_invoices")
      .select(
        "id, invoice_number, status, amount, currency, description, issued_at, paid_at, voided_at, cancelled_at, payment_history_id, created_at"
      )
      .eq("subscription_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (historyRes.error) console.warn("[admin/subscriptions/detail] history", historyRes.error.message);
  if (eventsRes.error) console.warn("[admin/subscriptions/detail] events", eventsRes.error.message);
  if (invoicesRes.error) console.warn("[admin/subscriptions/detail] invoices", invoicesRes.error.message);

  const history = (historyRes.data || []).map((h) => ({
    id: h.id,
    date: h.transaction_date || h.created_at,
    amount: Number(h.amount || 0),
    currency: String(h.currency || "ZAR").toUpperCase(),
    status: h.payment_status,
    method: h.payment_method || null,
    payfastPaymentId: h.payfast_payment_id || null,
  }));

  /** Event log rows (History of actions + timeline source). */
  const eventRows = eventsRes.data || [];
  const eventLogs = eventRows.map((e) => ({
    id: e.id,
    kind: "event",
    date: e.created_at,
    type: e.event_type,
    label: SUBSCRIPTION_EVENT_LABELS[e.event_type] || e.event_type,
    source: e.source || null,
    details: e.details || null,
  }));

  /** Product Event Timeline: Created → Redirected → ITN Received → Verified → Activated → Renewed → Cancelled */
  const eventTimeline = buildSubscriptionEventTimeline(eventRows);

  /** ITN verification logs (admin-only; summarized — not exposed to JWT clients). */
  let itnLogs = [];
  const pfPaymentIds = [
    ...new Set(
      [
        sub.payfast_payment_id,
        ...history.map((h) => h.payfastPaymentId),
      ].filter(Boolean)
    ),
  ].slice(0, 20);

  const mPaymentId = sub.m_payment_id || null;
  try {
    const orParts = [];
    if (mPaymentId) orParts.push(`received_data->>m_payment_id.eq.${mPaymentId}`);
    if (sub.user_id) orParts.push(`received_data->>custom_str1.eq.${sub.user_id}`);
    for (const pf of pfPaymentIds) {
      orParts.push(`received_data->>pf_payment_id.eq.${pf}`);
    }
    if (orParts.length) {
      const { data: itnRows, error: itnErr } = await supabase
        .from("payfast_itn_logs")
        .select(
          "id, created_at, verified, signature_valid, amount_valid, merchant_valid, verification_response, received_data"
        )
        .or(orParts.join(","))
        .order("created_at", { ascending: false })
        .limit(50);
      if (itnErr) {
        console.warn("[admin/subscriptions/detail] itn logs", itnErr.message);
      } else {
        itnLogs = (itnRows || []).map((row) => {
          const rd = row.received_data && typeof row.received_data === "object" ? row.received_data : {};
          return {
            id: row.id,
            kind: "itn",
            date: row.created_at,
            type: "payfast_itn",
            verified: Boolean(row.verified),
            signatureValid: row.signature_valid,
            amountValid: row.amount_valid,
            merchantValid: row.merchant_valid,
            verificationResponse: row.verification_response || null,
            paymentStatus: rd.payment_status || null,
            pfPaymentId: rd.pf_payment_id || null,
            amountGross: rd.amount_gross || null,
          };
        });
      }
    }
  } catch (e) {
    console.warn("[admin/subscriptions/detail] itn logs", e?.message || e);
  }

  const logs = [...eventLogs, ...itnLogs].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  const invoices = (invoicesRes.data || []).map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoice_number || null,
    status: inv.status,
    amount: Number(inv.amount || 0),
    currency: String(inv.currency || "ZAR").toUpperCase(),
    description: inv.description || null,
    issuedAt: inv.issued_at || null,
    paidAt: inv.paid_at || null,
    voidedAt: inv.voided_at || null,
    cancelledAt: inv.cancelled_at || null,
    paymentHistoryId: inv.payment_history_id || null,
    createdAt: inv.created_at,
  }));

  const successfulHistory = history.filter(
    (h) => String(h.status || "").toLowerCase() === PAYMENT_HISTORY_STATUS.COMPLETED
  );
  const successfulTotal = successfulHistory.reduce((sum, h) => sum + Number(h.amount || 0), 0);
  const lastSuccessful = successfulHistory[0] || null;

  return json(res, 200, {
    subscription: {
      id: sub.id,
      status: sub.status,
      company: company?.name || null,
      companyId: sub.company_id || null,
      owner: owner
        ? {
            id: owner.id,
            name: owner.name,
            email: owner.email,
            createdAt: owner.createdAt || null,
            label: owner.name || owner.email || "—",
          }
        : null,
      plan: planSlug,
      planName: planName || planSlug,
      planAmount,
      billingCycle: planBillingCycle,
      currency: String(sub.currency || "ZAR").toUpperCase(),
      payfastId,
      payfastSubscriptionId: sub.payfast_subscription_id || null,
      payfastPaymentId: sub.payfast_payment_id || null,
      payfastToken: sub.payfast_token || null,
      mPaymentId: sub.m_payment_id || null,
      renewDate,
      trialStartedAt: sub.trial_started_at || null,
      trialEndsAt: sub.trial_ends_at || null,
      subscriptionSource: sub.subscription_source || null,
      adminOverride: Boolean(sub.admin_override),
      failureCount: Number(sub.failure_count || 0),
      activatedAt: sub.activated_at || sub.started_at || null,
      cancelledAt: sub.cancelled_at || null,
      expiresAt: sub.expires_at || null,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
      paymentsSummary: {
        successfulCount: successfulHistory.length,
        successfulAmount: Math.round(successfulTotal * 100) / 100,
        lastSuccessfulAt: lastSuccessful?.date || null,
      },
    },
    history,
    logs,
    invoices,
    eventTimeline,
  });
}

/**
 * GET /api/admin/subscriptions
 * Query: id= → Subscription Details.
 * Query: overview=1 | countsOnly=1 → status overview only (Admin Dashboard).
 * Otherwise returns paginated list + overview counts.
 */
export async function handleAdminSubscriptionsList(req, res) {
  const q = req.query || {};
  const detailId = String(q.id || q.subscriptionId || "").trim();
  if (detailId) {
    return handleAdminSubscriptionDetail(req, res, detailId);
  }

  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const overviewOnly =
    String(q.overview || "").trim() === "1" ||
    String(q.countsOnly || "").trim() === "1" ||
    String(q.overview || "").trim().toLowerCase() === "true";

  let overview = null;
  let reporting = null;
  try {
    overview = await buildSubscriptionOverview(supabase);
  } catch (e) {
    console.error("[admin/subscriptions] overview", e);
    return json(res, 500, { error: "Failed to load subscription overview" });
  }
  try {
    reporting = await buildBillingReporting(supabase);
  } catch (e) {
    console.warn("[admin/subscriptions] reporting", e?.message || e);
    reporting = {
      startDate: PAYMENT_REPORTING_START_ISO,
      timezone: "UTC",
      successfulPayments: 0,
      revenue: 0,
      currency: "ZAR",
      activeSubscribers: overview.active || 0,
      trialUsers: overview.trial || 0,
      expiredTrials: overview.expired || 0,
    };
  }

  if (overviewOnly) {
    return json(res, 200, { overview, reporting });
  }

  const status = String(q.status || "").trim();
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 50));
  const offset = Math.max(0, Number(q.offset) || 0);

  const runList = (selectCols) => {
    let query = supabase
      .from("subscriptions")
      .select(selectCols, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (status) query = query.eq("status", status);
    return query;
  };

  let { data, error, count } = await runList(LIST_SELECT_RICH);
  if (error) {
    ({ data, error, count } = await runList(LIST_SELECT_LEAN));
  }
  if (error) {
    ({ data, error, count } = await runList("*"));
  }
  if (error) {
    console.error("[admin/subscriptions]", error);
    return json(res, 500, { error: "Failed to list subscriptions" });
  }

  const subscriptions = (data || []).map(normalizeAdminSubscriptionListRow);
  return json(res, 200, {
    subscriptions,
    count: count ?? subscriptions.length,
    overview,
    reporting,
  });
}

/**
 * POST /api/admin/subscriptions — admin create (service_role). Body: plan, amount, user_id, email, status, …
 */
export async function handleAdminSubscriptionCreate(req, res) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase, user } = ctx;

  const body = parseJsonBody(req);
  if (body == null) return json(res, 400, { error: "Invalid JSON body" });

  let row;
  try {
    row = buildAdminSubscriptionWriteRow(body, { isCreate: true });
  } catch (e) {
    return json(res, e.status || 400, { error: e.message || "Invalid payload" });
  }

  const nowIso = new Date().toISOString();
  row.created_at = nowIso;
  row.updated_at = nowIso;
  if (user?.id) row.created_by = user.id;
  row.admin_override = true;
  row.subscription_source = SUBSCRIPTION_SOURCE.ADMIN;
  row.admin_override_at = nowIso;
  if (user?.id) row.admin_override_by = user.id;
  if (row.status === SUBSCRIPTION_STATUS.ACTIVE && !row.activated_at) {
    row.activated_at = nowIso;
  }

  await attachPlanId(supabase, row);
  await attachCompanyId(supabase, row);

  const { data, error } = await supabase.from("subscriptions").insert(row).select("*").single();
  if (error || !data) {
    console.error("[admin/subscriptions/create]", error);
    return json(res, 500, { error: error?.message || "Failed to create subscription" });
  }

  await logAdminSubscriptionEvent(
    supabase,
    data.id,
    data.company_id,
    SUBSCRIPTION_EVENT_TYPE.SUBSCRIPTION_CREATED,
    { source: "admin", actor_id: user?.id || null, plan: data.plan || data.plan_slug }
  );
  if (data.status === SUBSCRIPTION_STATUS.ACTIVE) {
    await logAdminSubscriptionEvent(supabase, data.id, data.company_id, SUBSCRIPTION_EVENT_TYPE.ACTIVATED, {
      source: "admin",
      actor_id: user?.id || null,
    });
  }

  return json(res, 200, { subscription: normalizeAdminSubscriptionListRow(data) });
}

/**
 * PATCH /api/admin/subscriptions — admin update. Body: { id, action?, ...fields }
 * Named actions always set admin_override so trial expiry cannot revert them.
 */
export async function handleAdminSubscriptionUpdate(req, res) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase, user } = ctx;

  const body = parseJsonBody(req);
  if (body == null) return json(res, 400, { error: "Invalid JSON body" });

  const id = String(body.id || body.subscriptionId || "").trim();
  if (!id || !isValidUuid(id)) return json(res, 400, { error: "subscription id required" });

  const { data: existing, error: loadErr } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) {
    console.error("[admin/subscriptions/update] load", loadErr);
    return json(res, 500, { error: "Failed to load subscription" });
  }
  if (!existing) return json(res, 404, { error: "Subscription not found" });

  let patch;
  let auditAction = "update";
  let auditDescription = "Admin updated subscription";
  try {
    if (body.action) {
      const built = buildAdminOverridePatch(existing, body, { actorId: user?.id || null });
      patch = built.patch;
      auditAction = built.action;
      auditDescription = built.description;
    } else {
      patch = buildAdminSubscriptionWriteRow(body, { isCreate: false });
      delete patch.created_by;
      const nowIso = new Date().toISOString();
      patch.updated_at = nowIso;
      patch.admin_override = true;
      patch.subscription_source = SUBSCRIPTION_SOURCE.ADMIN;
      patch.admin_override_at = nowIso;
      if (user?.id) patch.admin_override_by = user.id;
      const reason = String(body.reason || "").trim();
      if (reason) patch.admin_override_reason = reason.slice(0, 500);
      if (patch.status === SUBSCRIPTION_STATUS.CANCELLED) {
        patch.cancelled_at = patch.cancelled_at || nowIso;
      }
      if (reason) auditDescription = reason;
    }
  } catch (e) {
    return json(res, e.status || 400, { error: e.message || "Invalid payload" });
  }

  await attachPlanId(supabase, patch);

  const { data, error } = await supabase
    .from("subscriptions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[admin/subscriptions/update]", error);
    return json(res, 500, { error: error.message || "Failed to update subscription" });
  }
  if (!data) return json(res, 404, { error: "Subscription not found" });

  if (patch.status === SUBSCRIPTION_STATUS.CANCELLED) {
    await logAdminSubscriptionEvent(supabase, data.id, data.company_id, SUBSCRIPTION_EVENT_TYPE.CANCELLED, {
      source: "admin",
      actor_id: user?.id || null,
    });
  } else if (patch.status === SUBSCRIPTION_STATUS.ACTIVE && existing.status !== SUBSCRIPTION_STATUS.ACTIVE) {
    await logAdminSubscriptionEvent(supabase, data.id, data.company_id, SUBSCRIPTION_EVENT_TYPE.ACTIVATED, {
      source: "admin",
      actor_id: user?.id || null,
      action: auditAction,
    });
  }

  await writeAdminSubscriptionAudit(supabase, {
    actor: user,
    target: data,
    action: auditAction,
    description: auditDescription,
    before: {
      status: existing.status,
      plan: existing.plan || existing.plan_slug,
      trial_ends_at: existing.trial_ends_at || null,
    },
    after: {
      status: data.status,
      plan: data.plan || data.plan_slug,
      trial_ends_at: data.trial_ends_at || null,
    },
  });

  return json(res, 200, { subscription: normalizeAdminSubscriptionListRow(data) });
}

async function writeAdminSubscriptionAudit(supabase, { actor, target, action, description, before, after }) {
  try {
    await supabase.from("audit_logs").insert({
      category: "subscription",
      action: `admin_subscription_${action}`,
      description: description || "Admin updated subscription",
      before: before || {},
      after: after || {},
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_name: actor?.user_metadata?.full_name || actor?.email || null,
      actor_role: "admin",
      target_label: target?.email || target?.id || null,
      metadata: {
        subscription_id: target?.id || null,
        user_id: target?.user_id || null,
        company_id: target?.company_id || null,
        previous_status: before?.status || null,
        new_status: after?.status || null,
        previous_plan: before?.plan || null,
        new_plan: after?.plan || null,
        previous_trial_end: before?.trial_ends_at || null,
        new_trial_end: after?.trial_ends_at || null,
      },
    });
  } catch (e) {
    console.warn("[admin/subscriptions] audit_logs insert failed", e?.message || e);
  }
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Normalize recurring charge to a monthly figure. */
function amountToMonthly(amount, billingCycle) {
  const a = Number(amount) || 0;
  if (!Number.isFinite(a) || a <= 0) return 0;
  const c = String(billingCycle || "monthly").trim().toLowerCase();
  if (c === "annual" || c === "yearly" || c === "annually") return a / 12;
  if (c === "quarterly") return a / 3;
  if (c === "biannual" || c === "semi_annual" || c === "semiannual") return a / 6;
  return a;
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Page through payment_history amount rows (append-only ledger).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ status: string, sinceIso: string }} opts
 */
async function fetchPaymentRowsSince(supabase, { status, sinceIso }) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("payment_history")
      .select("amount, currency, payment_status, transaction_date, created_at, company_id")
      .eq("payment_status", status)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 20000) break; // hard safety
  }
  return rows;
}

function sumAmountsInWindow(rows, { from, to }) {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    const at = paymentEffectiveAt(r);
    if (!at) continue;
    if (from && at < from) continue;
    if (to && at >= to) continue;
    sum += Number(r.amount || 0);
    count += 1;
  }
  return { amount: roundMoney(sum), count };
}

/**
 * Admin Revenue metrics (MRR/ARR from active subscriptions; cash metrics from payment_history).
 */
export async function buildRevenueMetrics(supabase) {
  const now = new Date();
  const todayStart = startOfUtcDay(now);
  const monthStart = startOfUtcMonth(now);
  const lookbackIso = new Date(monthStart.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  let activeSubsResult = await supabase
    .from("subscriptions")
    .select(
      "id, amount, billing_cycle, company_id, user_id, status, plan_family, plan_slug, plans:plan_id(amount, billing_cycle, currency, plan_family, is_legacy)"
    )
    .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
    .limit(5000);

  if (activeSubsResult.error) {
    // Fallback if embed/FK unavailable on this schema revision
    activeSubsResult = await supabase
      .from("subscriptions")
      .select("id, amount, billing_cycle, company_id, user_id, status, plan_family, plan_slug")
      .eq("status", SUBSCRIPTION_STATUS.ACTIVE)
      .limit(5000);
  }

  const [completedRows, failedRows, refundedRows] = await Promise.all([
    fetchPaymentRowsSince(supabase, {
      status: PAYMENT_HISTORY_STATUS.COMPLETED,
      sinceIso: lookbackIso,
    }),
    fetchPaymentRowsSince(supabase, {
      status: PAYMENT_HISTORY_STATUS.FAILED,
      sinceIso: lookbackIso,
    }),
    fetchPaymentRowsSince(supabase, {
      status: PAYMENT_HISTORY_STATUS.REFUNDED,
      sinceIso: lookbackIso,
    }),
  ]);

  if (activeSubsResult.error) throw activeSubsResult.error;

  const activeSubs = activeSubsResult.data || [];
  let mrr = 0;
  let recognizedMrr = 0;
  let legacyMrr = 0;
  let newCatalogMrr = 0;
  const mrrByFamily = { starter: 0, business: 0, growth: 0, enterprise: 0, unknown: 0 };
  const mrrByCycle = { monthly: 0, annual: 0, other: 0 };
  const payerKeys = new Set();
  for (const sub of activeSubs) {
    const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
    // Prefer subscription.amount (pinned at checkout / grandfather) over catalog reprice
    const amount =
      sub.amount != null && Number(sub.amount) > 0
        ? Number(sub.amount)
        : plan?.amount != null && Number(plan.amount) > 0
          ? Number(plan.amount)
          : 0;
    const cycle = plan?.billing_cycle || sub.billing_cycle || "monthly";
    const monthly = amountToMonthly(amount, cycle);
    mrr += monthly;
    recognizedMrr += monthly;
    const family = String(sub.plan_family || plan?.plan_family || "unknown").toLowerCase();
    if (family in mrrByFamily) mrrByFamily[family] += monthly;
    else mrrByFamily.unknown += monthly;
    const cyc = String(cycle).toLowerCase();
    if (cyc === "annual" || cyc === "yearly" || cyc === "annually") mrrByCycle.annual += monthly;
    else if (cyc === "monthly") mrrByCycle.monthly += monthly;
    else mrrByCycle.other += monthly;
    if (plan?.is_legacy) legacyMrr += monthly;
    else newCatalogMrr += monthly;
    const payer = sub.company_id || sub.user_id;
    if (payer) payerKeys.add(String(payer));
  }
  mrr = roundMoney(mrr);
  recognizedMrr = roundMoney(recognizedMrr);
  legacyMrr = roundMoney(legacyMrr);
  newCatalogMrr = roundMoney(newCatalogMrr);
  for (const k of Object.keys(mrrByFamily)) mrrByFamily[k] = roundMoney(mrrByFamily[k]);
  for (const k of Object.keys(mrrByCycle)) mrrByCycle[k] = roundMoney(mrrByCycle[k]);
  const arr = roundMoney(mrr * 12);
  const payingUsers = payerKeys.size || activeSubs.length;
  const arpu = payingUsers > 0 ? roundMoney(mrr / payingUsers) : 0;

  const todaysRevenue = sumAmountsInWindow(completedRows, { from: todayStart, to: null });
  const monthlyRevenue = sumAmountsInWindow(completedRows, { from: monthStart, to: null });
  const failedRevenue = sumAmountsInWindow(failedRows, { from: monthStart, to: null });
  const refunds = sumAmountsInWindow(refundedRows, { from: monthStart, to: null });

  return {
    currency: "ZAR",
    mrr,
    arr,
    recognizedMrr,
    legacyMrr,
    newCatalogMrr,
    mrrByFamily,
    mrrByCycle,
    todaysRevenue: todaysRevenue.amount,
    monthlyRevenue: monthlyRevenue.amount,
    failedRevenue: failedRevenue.amount,
    refunds: refunds.amount,
    averageRevenuePerUser: arpu,
    /** Aliases / supporting meta */
    arpu,
    activeSubscriptionCount: activeSubs.length,
    payingUserCount: payingUsers,
    todaysPaymentCount: todaysRevenue.count,
    monthlyPaymentCount: monthlyRevenue.count,
    failedPaymentCount: failedRevenue.count,
    refundCount: refunds.count,
    period: {
      todayStart: todayStart.toISOString(),
      monthStart: monthStart.toISOString(),
      timezone: "UTC",
    },
    metrics: [
      { key: "mrr", label: "MRR", amount: mrr },
      { key: "arr", label: "ARR", amount: arr },
      { key: "recognizedMrr", label: "Recognized MRR", amount: recognizedMrr },
      { key: "legacyMrr", label: "Legacy MRR", amount: legacyMrr },
      { key: "newCatalogMrr", label: "New catalog MRR", amount: newCatalogMrr },
      { key: "todaysRevenue", label: "Today's Revenue", amount: todaysRevenue.amount },
      { key: "monthlyRevenue", label: "Monthly Revenue", amount: monthlyRevenue.amount },
      { key: "failedRevenue", label: "Failed Revenue", amount: failedRevenue.amount },
      { key: "refunds", label: "Refunds", amount: refunds.amount },
      { key: "arpu", label: "ARPU", amount: arpu },
    ],
  };
}

/**
 * GET /api/admin/revenue
 * Query: metrics=1 | overview=1 → Revenue dashboard metrics only.
 * Otherwise trailing `days` completed payments list + metrics.
 */
export async function handleAdminRevenue(req, res) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const q = req.query || {};
  const metricsOnly =
    String(q.metrics || "").trim() === "1" ||
    String(q.overview || "").trim() === "1" ||
    String(q.metrics || "").trim().toLowerCase() === "true";

  let metrics = null;
  try {
    metrics = await buildRevenueMetrics(supabase);
  } catch (e) {
    console.error("[admin/revenue] metrics", e);
    return json(res, 500, { error: "Failed to load revenue metrics" });
  }

  if (metricsOnly) {
    return json(res, 200, { metrics, ...metrics });
  }

  const days = Math.min(365, Math.max(1, Number(q.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("payment_history")
    .select("id, amount, currency, payment_status, transaction_date, created_at, company_id")
    .eq("payment_status", PAYMENT_HISTORY_STATUS.COMPLETED)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[admin/revenue]", error);
    return json(res, 500, { error: "Failed to load revenue" });
  }

  const rows = data || [];
  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const byCurrency = {};
  for (const r of rows) {
    const c = String(r.currency || "ZAR").toUpperCase();
    byCurrency[c] = (byCurrency[c] || 0) + Number(r.amount || 0);
  }

  return json(res, 200, {
    days,
    since,
    paymentCount: rows.length,
    totalAmount: total,
    byCurrency,
    payments: rows.slice(0, 100),
    metrics,
  });
}

/**
 * Human-readable failure reason from PayFast ITN / ledger metadata.
 * @param {Record<string, unknown>|null|undefined} rawItn
 */
export function deriveFailedPaymentReason(rawItn) {
  if (!rawItn || typeof rawItn !== "object") return "Payment failed";
  const candidates = [
    rawItn.status_reason,
    rawItn.reason,
    rawItn.failure_reason,
    rawItn.error,
    rawItn.error_message,
  ];
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s.slice(0, 240);
  }
  const status = String(rawItn.payment_status || "").trim().toUpperCase();
  if (status === "FAILED") return "PayFast payment failed";
  if (status === "CANCELLED" || status === "CANCELED") return "Payment cancelled at PayFast";
  if (status) return `PayFast status: ${status}`;
  return "Payment failed";
}

/**
 * GET /api/admin/failed-payments
 * Returns rows shaped for Admin Dashboard:
 * Company | Date | Reason | Retry Count | Amount
 */
export async function handleAdminFailedPayments(req, res) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const q = req.query || {};
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));

  let { data, error } = await supabase
    .from("payment_history")
    .select(
      "id, subscription_id, company_id, payfast_payment_id, amount, currency, payment_status, payment_method, transaction_date, created_at, raw_itn"
    )
    .eq("payment_status", PAYMENT_HISTORY_STATUS.FAILED)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error && /raw_itn/i.test(String(error.message || ""))) {
    ({ data, error } = await supabase
      .from("payment_history")
      .select(
        "id, subscription_id, company_id, payfast_payment_id, amount, currency, payment_status, payment_method, transaction_date, created_at"
      )
      .eq("payment_status", PAYMENT_HISTORY_STATUS.FAILED)
      .order("created_at", { ascending: false })
      .limit(limit));
  }

  if (error) {
    console.error("[admin/failed-payments]", error);
    return json(res, 500, { error: "Failed to load failed payments" });
  }

  const rows = data || [];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const subscriptionIds = [...new Set(rows.map((r) => r.subscription_id).filter(Boolean))];

  const companyNameById = new Map();
  if (companyIds.length) {
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", companyIds);
    for (const o of orgs || []) {
      companyNameById.set(o.id, o.name || null);
    }
  }

  const subMetaById = new Map();
  if (subscriptionIds.length) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, failure_count, email, user_id, company_id, plan_slug, plan")
      .in("id", subscriptionIds);
    for (const s of subs || []) {
      subMetaById.set(s.id, s);
    }
  }

  const failedPayments = rows.map((r) => {
    const sub = r.subscription_id ? subMetaById.get(r.subscription_id) : null;
    const companyName =
      (r.company_id && companyNameById.get(r.company_id)) ||
      null;
    const email = sub?.email || r.raw_itn?.email_address || r.raw_itn?.email || null;
    const date = r.transaction_date || r.created_at || null;
    const reason = deriveFailedPaymentReason(r.raw_itn);
    const retryCount = Number(sub?.failure_count || 0);

    return {
      id: r.id,
      companyId: r.company_id || sub?.company_id || null,
      company: companyName || email || "Unknown company",
      companyName: companyName || null,
      email: email || null,
      date,
      reason,
      retryCount,
      amount: Number(r.amount || 0),
      currency: String(r.currency || "ZAR").toUpperCase(),
      subscriptionId: r.subscription_id || null,
      payfastPaymentId: r.payfast_payment_id || null,
      paymentStatus: r.payment_status,
      createdAt: r.created_at,
    };
  });

  return json(res, 200, {
    failedPayments,
    count: failedPayments.length,
    columns: ["company", "date", "reason", "retryCount", "amount"],
  });
}

/**
 * GET /api/admin/payments
 * Verified PayFast ledger with reporting labels. Default period starts 2026-08-20 UTC.
 * Only SUCCESSFUL rows count toward revenue.
 */
export async function handleAdminPayments(req, res) {
  const ctx = await requireBillingAdmin(req, res);
  if (!ctx) return;
  const { supabase } = ctx;

  const q = req.query || {};
  const fromIso = String(q.from || q.since || PAYMENT_REPORTING_START_ISO).trim() || PAYMENT_REPORTING_START_ISO;
  const toRaw = String(q.to || "").trim();
  const statusFilter = String(q.status || "").trim().toUpperCase();
  const search = String(q.q || q.customer || q.email || "").trim().toLowerCase();
  const planFilter = String(q.plan || "").trim().toLowerCase();
  const paymentId = String(q.paymentId || q.payfast_payment_id || q.id || "").trim();
  const limit = Math.min(2000, Math.max(1, Number(q.limit) || 200));

  let query = supabase
    .from("payment_history")
    .select(
      "id, subscription_id, company_id, amount, currency, payment_status, payment_method, payfast_payment_id, transaction_date, created_at"
    )
    .gte("created_at", fromIso)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (toRaw) {
    const toDate = new Date(toRaw);
    if (Number.isFinite(toDate.getTime())) query = query.lte("created_at", toDate.toISOString());
  }
  if (paymentId) {
    query = query.or(`id.eq.${paymentId},payfast_payment_id.eq.${paymentId}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[admin/payments]", error);
    return json(res, 500, { error: "Failed to load payments" });
  }

  const rows = data || [];
  const subscriptionIds = [...new Set(rows.map((r) => r.subscription_id).filter(Boolean))];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];

  const subMetaById = new Map();
  if (subscriptionIds.length) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, email, user_email, full_name, user_name, user_id, company_id, plan_slug, plan, plan_family")
      .in("id", subscriptionIds);
    for (const s of subs || []) subMetaById.set(s.id, s);
  }

  const companyNameById = new Map();
  if (companyIds.length) {
    const { data: orgs } = await supabase.from("organizations").select("id, name").in("id", companyIds);
    for (const o of orgs || []) companyNameById.set(o.id, o.name || null);
  }

  const ownerIds = [
    ...new Set(
      [...subMetaById.values()].map((s) => s.user_id).filter(Boolean)
    ),
  ];
  const profileById = new Map();
  if (ownerIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, company_name")
      .in("id", ownerIds);
    for (const p of profiles || []) profileById.set(p.id, p);
  }

  let payments = rows.map((r) => {
    const sub = r.subscription_id ? subMetaById.get(r.subscription_id) : null;
    const profile = sub?.user_id ? profileById.get(sub.user_id) : null;
    const label = reportingPaymentLabel(r);
    const at = paymentEffectiveAt(r);
    return {
      id: r.id,
      paidlyPaymentId: r.id,
      payfastPaymentId: r.payfast_payment_id || null,
      subscriptionId: r.subscription_id || null,
      companyId: r.company_id || sub?.company_id || null,
      company: companyNameById.get(r.company_id) || profile?.company_name || null,
      customer: profile?.full_name || sub?.full_name || sub?.user_name || null,
      email: profile?.email || sub?.email || sub?.user_email || null,
      plan: sub?.plan_family || sub?.plan || sub?.plan_slug || null,
      amount: Number(r.amount || 0),
      currency: String(r.currency || "ZAR").toUpperCase(),
      ledgerStatus: r.payment_status,
      status: label,
      paymentDate: at ? at.toISOString() : r.created_at,
      paymentMethod: r.payment_method || "payfast",
      provider: r.payment_method || "payfast",
      countsTowardRevenue: label === "SUCCESSFUL" && at && at.getTime() >= new Date(PAYMENT_REPORTING_START_ISO).getTime(),
    };
  });

  if (statusFilter) {
    payments = payments.filter((p) => p.status === statusFilter);
  }
  if (planFilter) {
    payments = payments.filter((p) => String(p.plan || "").toLowerCase().includes(planFilter));
  }
  if (search) {
    payments = payments.filter((p) => {
      const blob = `${p.customer || ""} ${p.email || ""} ${p.company || ""} ${p.payfastPaymentId || ""} ${p.paidlyPaymentId || ""}`.toLowerCase();
      return blob.includes(search);
    });
  }

  const reporting = await buildBillingReporting(supabase);

  return json(res, 200, {
    startDate: PAYMENT_REPORTING_START_ISO,
    from: fromIso,
    to: toRaw || null,
    timezone: "UTC",
    payments,
    count: payments.length,
    reporting,
  });
}

