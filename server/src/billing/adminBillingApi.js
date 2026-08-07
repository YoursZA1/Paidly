import { getBillingSupabaseAdmin } from "./supabaseAdmin.js";
import { requireBearerUser } from "./httpAuth.js";
import { assertCallerForAdminRoute } from "../adminRouteAccess.js";
import { PAYMENT_HISTORY_STATUS } from "../../../shared/paymentHistoryStatuses.js";
import { SUBSCRIPTION_STATUS } from "../../../shared/subscriptionStatuses.js";
import {
  SUBSCRIPTION_EVENT_LABELS,
  buildSubscriptionEventTimeline,
} from "../../../shared/subscriptionEventTypes.js";

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

  return {
    active: counts.active || 0,
    pending: counts.pending || 0,
    expired: counts.expired || 0,
    cancelled: counts.cancelled || 0,
    trial: counts.trial || 0,
    pastDue: counts.pastDue || 0,
    /** Sum of overview buckets (may be less than all rows when other statuses exist). */
    bucketTotal: total,
    /** All rows in `subscriptions`. */
    total: allCount ?? total,
    buckets: OVERVIEW_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts[b.key] || 0,
    })),
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
  return supabase;
}

/**
 * GET /api/admin/subscriptions?id=
 * Subscription Details: Company, Owner, Plan, PayFast ID, Renew Date + History / Logs / Invoices.
 */
export async function handleAdminSubscriptionDetail(req, res, subscriptionId) {
  const supabase = await requireBillingAdmin(req, res);
  if (!supabase) return;

  const id = String(subscriptionId || "").trim();
  if (!id) return json(res, 400, { error: "subscription id required" });

  let { data: sub, error: subErr } = await supabase
    .from("subscriptions")
    .select(
      "id, status, plan_id, plan_slug, plan, current_plan, amount, currency, billing_cycle, company_id, user_id, email, payfast_token, payfast_subscription_id, payfast_payment_id, m_payment_id, next_billing_date, current_period_end, expires_at, activated_at, started_at, cancelled_at, failure_count, created_at, updated_at"
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
      .select("id, full_name, email")
      .eq("id", ownerUserId)
      .maybeSingle();
    owner = profile
      ? {
          id: profile.id,
          name: profile.full_name || null,
          email: profile.email || sub.email || null,
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
      renewDate,
      failureCount: Number(sub.failure_count || 0),
      activatedAt: sub.activated_at || sub.started_at || null,
      cancelledAt: sub.cancelled_at || null,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
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

  const supabase = await requireBillingAdmin(req, res);
  if (!supabase) return;

  const overviewOnly =
    String(q.overview || "").trim() === "1" ||
    String(q.countsOnly || "").trim() === "1" ||
    String(q.overview || "").trim().toLowerCase() === "true";

  let overview = null;
  try {
    overview = await buildSubscriptionOverview(supabase);
  } catch (e) {
    console.error("[admin/subscriptions] overview", e);
    return json(res, 500, { error: "Failed to load subscription overview" });
  }

  if (overviewOnly) {
    return json(res, 200, { overview });
  }

  const status = String(q.status || "").trim();
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
  const offset = Math.max(0, Number(q.offset) || 0);

  let query = supabase
    .from("subscriptions")
    .select(
      "id, status, plan_slug, amount, currency, company_id, user_id, email, activated_at, next_billing_date, cancelled_at, failure_count, created_at, updated_at",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/subscriptions]", error);
    return json(res, 500, { error: "Failed to list subscriptions" });
  }

  return json(res, 200, {
    subscriptions: data || [],
    count: count ?? (data || []).length,
    overview,
  });
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

function paymentEffectiveAt(row) {
  const raw = row?.transaction_date || row?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
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
  const supabase = await requireBillingAdmin(req, res);
  if (!supabase) return;

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
  const supabase = await requireBillingAdmin(req, res);
  if (!supabase) return;

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
