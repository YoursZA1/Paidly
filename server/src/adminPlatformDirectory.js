import {
  ADMIN_DIRECTORY_KINDS,
  buildSparkline,
  healthStatus,
  inWindow,
  isMissingRelationError,
  money,
  normalizeAdminPeriod,
  percentChange,
  resolvePeriodWindow,
  sumField,
} from "../../shared/admin/adminPlatformDirectory.js";

const DIRECTORY_LIMIT_MAX = 200;

function unavailable(kind, reason) {
  return {
    kind,
    rows: [],
    unavailable: true,
    unavailableReason: reason || "This data source is not available yet.",
    count: 0,
  };
}

async function queryTable(supabase, table, build) {
  try {
    const result = await build(supabase.from(table));
    if (result.error) {
      if (isMissingRelationError(result.error)) {
        return { data: [], count: 0, unavailable: true, reason: `${table} is not available in this environment.` };
      }
      return { data: [], count: 0, unavailable: true, reason: result.error.message || `Failed to read ${table}` };
    }
    return {
      data: result.data || [],
      count: typeof result.count === "number" ? result.count : (result.data || []).length,
      unavailable: false,
      reason: null,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { data: [], count: 0, unavailable: true, reason: `${table} is not available in this environment.` };
    }
    return { data: [], count: 0, unavailable: true, reason: error?.message || `Failed to read ${table}` };
  }
}

async function countTable(supabase, table, apply = (q) => q) {
  const result = await queryTable(supabase, table, (q) => apply(q.select("id", { count: "exact", head: true })));
  return result;
}

function orgName(org) {
  return String(org?.name || org?.company_name || "Untitled business").trim();
}

function pickTime(row, keys) {
  for (const key of keys) {
    if (row?.[key]) return row[key];
  }
  return null;
}

function paidLike(status) {
  const s = String(status || "").toLowerCase();
  return s === "paid" || s === "completed" || s === "success" || s === "settled";
}

function failedLike(status) {
  const s = String(status || "").toLowerCase();
  return s === "failed" || s === "declined" || s === "error";
}

async function loadOrgNames(supabase, ids) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))];
  const map = new Map();
  if (!unique.length) return map;
  const { data } = await supabase.from("organizations").select("id, name").in("id", unique.slice(0, 200));
  for (const row of data || []) map.set(String(row.id), orgName(row));
  return map;
}

export async function listAdminDirectory(supabase, kind, opts = {}) {
  const normalized = String(kind || "").trim().toLowerCase();
  if (!ADMIN_DIRECTORY_KINDS.includes(normalized)) {
    return { error: "Unknown directory kind", status: 400 };
  }
  const limit = Math.min(DIRECTORY_LIMIT_MAX, Math.max(1, Number(opts.limit) || 50));

  if (normalized === "businesses") {
    const orgs = await queryTable(supabase, "organizations", (q) =>
      q.select("id, name, industry, business_type, created_at, owner_id").order("created_at", { ascending: false }).limit(limit)
    );
    if (orgs.unavailable) return unavailable("businesses", orgs.reason);
    const ids = orgs.data.map((o) => o.id);
    const [subs, memberships, invoices] = await Promise.all([
      queryTable(supabase, "subscriptions", (q) =>
        q.select("id, company_id, status, plan, plan_slug, plan_family, amount").in("company_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      ),
      queryTable(supabase, "memberships", (q) =>
        q.select("id, org_id").in("org_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      ),
      queryTable(supabase, "invoices", (q) =>
        q.select("id, org_id, total, amount").in("org_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      ),
    ]);
    const subByOrg = new Map();
    for (const s of subs.data) {
      if (s.company_id && !subByOrg.has(String(s.company_id))) subByOrg.set(String(s.company_id), s);
    }
    const usersByOrg = new Map();
    for (const m of memberships.data) {
      const key = String(m.org_id);
      usersByOrg.set(key, (usersByOrg.get(key) || 0) + 1);
    }
    const docsByOrg = new Map();
    const revByOrg = new Map();
    for (const inv of invoices.data) {
      const key = String(inv.org_id);
      docsByOrg.set(key, (docsByOrg.get(key) || 0) + 1);
      revByOrg.set(key, money((revByOrg.get(key) || 0) + money(inv.total ?? inv.amount)));
    }
    return {
      kind: "businesses",
      unavailable: false,
      count: orgs.count,
      rows: orgs.data.map((o) => {
        const sub = subByOrg.get(String(o.id));
        return {
          id: o.id,
          title: orgName(o),
          business: orgName(o),
          plan: sub?.plan_family || sub?.plan_slug || sub?.plan || "none",
          status: sub?.status || "none",
          users: usersByOrg.get(String(o.id)) || 0,
          documents: docsByOrg.get(String(o.id)) || 0,
          revenue: revByOrg.get(String(o.id)) || 0,
          date: o.created_at,
        };
      }),
    };
  }

  if (normalized === "plans") {
    let plans = await queryTable(supabase, "plans", (q) =>
      q.select("id, slug, name, billing_cycle, amount, currency, active, created_at").order("amount", { ascending: true }).limit(limit)
    );
    if (plans.unavailable) return unavailable("plans", plans.reason);
    return {
      kind: "plans",
      unavailable: false,
      count: plans.count,
      rows: plans.data.map((p) => ({
        id: p.id,
        title: p.name || p.slug,
        subtitle: p.slug,
        plan: p.plan_family || p.slug,
        status: p.active === false ? "inactive" : p.is_legacy ? "legacy" : "active",
        amount: money(p.amount),
        extra: p.billing_cycle,
        date: p.created_at,
      })),
    };
  }

  if (normalized === "affiliates") {
    const [partners, applications] = await Promise.all([
      queryTable(supabase, "affiliates", (q) =>
        q.select("id, referral_code, status, commission_rate, created_at, user_id").order("created_at", { ascending: false }).limit(limit)
      ),
      queryTable(supabase, "affiliate_applications", (q) =>
        q.select("id, email, full_name, status, created_at").order("created_at", { ascending: false }).limit(limit)
      ),
    ]);
    if (partners.unavailable && applications.unavailable) {
      return unavailable("affiliates", partners.reason || applications.reason);
    }
    const rows = [
      ...partners.data.map((a) => ({
        id: a.id,
        title: a.referral_code,
        subtitle: "Partner",
        status: a.status,
        extra: `${Math.round(Number(a.commission_rate || 0) * 100)}%`,
        date: a.created_at,
      })),
      ...applications.data.map((a) => ({
        id: a.id,
        title: a.full_name || a.email,
        subtitle: a.email,
        status: a.status,
        extra: "Application",
        date: a.created_at,
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { kind: "affiliates", unavailable: false, count: rows.length, rows: rows.slice(0, limit) };
  }

  if (normalized === "invoices" || normalized === "quotes" || normalized === "payslips" || normalized === "recurring") {
    const table =
      normalized === "invoices"
        ? "invoices"
        : normalized === "quotes"
          ? "quotes"
          : normalized === "recurring"
            ? "recurring_invoices"
            : "payslips";
    const docs = await queryTable(supabase, table, (q) =>
      q.select("id, org_id, invoice_number, quote_number, number, total, amount, status, created_at, client_name, project_title").order("created_at", { ascending: false }).limit(limit)
    );
    if (docs.unavailable) {
      const fallback = await queryTable(supabase, table, (q) =>
        q.select("id, org_id, total, amount, status, created_at").order("created_at", { ascending: false }).limit(limit)
      );
      if (fallback.unavailable) return unavailable(normalized, fallback.reason);
      const names = await loadOrgNames(supabase, fallback.data.map((r) => r.org_id));
      return {
        kind: normalized,
        unavailable: false,
        count: fallback.count,
        rows: fallback.data.map((r) => ({
          id: r.id,
          title: r.id,
          business: names.get(String(r.org_id)) || "—",
          amount: money(r.total ?? r.amount),
          status: r.status || "unknown",
          date: r.created_at,
        })),
      };
    }
    const names = await loadOrgNames(supabase, docs.data.map((r) => r.org_id));
    return {
      kind: normalized,
      unavailable: false,
      count: docs.count,
      rows: docs.data.map((r) => ({
        id: r.id,
        title: r.invoice_number || r.quote_number || r.number || r.project_title || r.id,
        subtitle: r.client_name || null,
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.total ?? r.amount),
        status: r.status || "unknown",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "pos") {
    const sales = await queryTable(supabase, "pos_sales_events", (q) =>
      q.select("id, org_id, provider, status, total_amount, currency, payment_method, occurred_at, created_at").order("occurred_at", { ascending: false }).limit(limit)
    );
    if (sales.unavailable) return unavailable("pos", sales.reason);
    const names = await loadOrgNames(supabase, sales.data.map((r) => r.org_id));
    return {
      kind: "pos",
      unavailable: false,
      count: sales.count,
      rows: sales.data.map((r) => ({
        id: r.id,
        title: r.provider || "POS",
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.total_amount),
        status: r.status || "completed",
        extra: r.payment_method || "—",
        date: r.occurred_at || r.created_at,
      })),
    };
  }

  if (normalized === "payments") {
    const payments = await queryTable(supabase, "payments", (q) =>
      q.select("id, org_id, invoice_id, amount, status, method, paid_at, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (payments.unavailable) return unavailable("payments", payments.reason);
    const names = await loadOrgNames(supabase, payments.data.map((r) => r.org_id));
    return {
      kind: "payments",
      unavailable: false,
      count: payments.count,
      rows: payments.data.map((r) => ({
        id: r.id,
        title: r.invoice_id || r.id,
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.amount),
        status: r.status || "unknown",
        extra: r.method || "—",
        date: r.paid_at || r.created_at,
      })),
    };
  }

  if (normalized === "employees") {
    const members = await queryTable(supabase, "memberships", (q) =>
      q.select("id, org_id, role, employment_status, employee_number, department, invited_email, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (members.unavailable) return unavailable("employees", members.reason);
    const names = await loadOrgNames(supabase, members.data.map((r) => r.org_id));
    return {
      kind: "employees",
      unavailable: false,
      count: members.count,
      rows: members.data.map((r) => ({
        id: r.id,
        title: r.invited_email || r.employee_number || r.id,
        business: names.get(String(r.org_id)) || "—",
        status: r.employment_status || r.role || "active",
        extra: r.department || r.role || "—",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "payroll") {
    const profiles = await queryTable(supabase, "payroll_profiles", (q) =>
      q.select("id, org_id, full_name, email, job_title, payroll_status, employment_status, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (profiles.unavailable) return unavailable("payroll", profiles.reason);
    const names = await loadOrgNames(supabase, profiles.data.map((r) => r.org_id));
    return {
      kind: "payroll",
      unavailable: false,
      count: profiles.count,
      rows: profiles.data.map((r) => ({
        id: r.id,
        title: r.full_name || r.email || r.id,
        subtitle: r.job_title,
        business: names.get(String(r.org_id)) || "—",
        status: r.payroll_status || r.employment_status || "active",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "leave") {
    const requests = await queryTable(supabase, "leave_requests", (q) =>
      q.select("id, org_id, status, start_date, end_date, working_days, reason, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (requests.unavailable) return unavailable("leave", requests.reason);
    const names = await loadOrgNames(supabase, requests.data.map((r) => r.org_id));
    return {
      kind: "leave",
      unavailable: false,
      count: requests.count,
      rows: requests.data.map((r) => ({
        id: r.id,
        title: r.reason || "Leave request",
        business: names.get(String(r.org_id)) || "—",
        status: r.status || "pending",
        extra: `${r.start_date || "—"} → ${r.end_date || "—"}`,
        date: r.created_at,
      })),
    };
  }

  if (normalized === "attendance") {
    const rows = await queryTable(supabase, "attendance_profiles", (q) =>
      q.select("id, org_id, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (rows.unavailable) return unavailable("attendance", rows.reason);
    const names = await loadOrgNames(supabase, rows.data.map((r) => r.org_id));
    return {
      kind: "attendance",
      unavailable: false,
      count: rows.count,
      rows: rows.data.map((r) => ({
        id: r.id,
        title: "Attendance profile",
        business: names.get(String(r.org_id)) || "—",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "payment-intents") {
    const intents = await queryTable(supabase, "payment_intents", (q) =>
      q.select("id, org_id, source_kind, provider, amount, currency, status, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (intents.unavailable) return unavailable("payment-intents", intents.reason);
    const names = await loadOrgNames(supabase, intents.data.map((r) => r.org_id));
    return {
      kind: "payment-intents",
      unavailable: false,
      count: intents.count,
      rows: intents.data.map((r) => ({
        id: r.id,
        title: r.source_kind || "intent",
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.amount),
        status: r.status || "pending",
        extra: r.provider || "—",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "refunds") {
    const history = await queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, currency, payment_status, payment_method, created_at").eq("payment_status", "refunded").order("created_at", { ascending: false }).limit(limit)
    );
    if (history.unavailable) return unavailable("refunds", history.reason);
    const names = await loadOrgNames(supabase, history.data.map((r) => r.company_id));
    return {
      kind: "refunds",
      unavailable: false,
      count: history.count,
      rows: history.data.map((r) => ({
        id: r.id,
        title: "Subscription refund",
        business: names.get(String(r.company_id)) || "—",
        amount: money(r.amount),
        status: r.payment_status,
        extra: r.payment_method || "PayFast",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "transactions") {
    const [history, invoicePayments, pos] = await Promise.all([
      queryTable(supabase, "payment_history", (q) =>
        q.select("id, company_id, amount, currency, payment_status, payment_method, created_at").order("created_at", { ascending: false }).limit(limit)
      ),
      queryTable(supabase, "payments", (q) =>
        q.select("id, org_id, amount, status, method, paid_at, created_at").order("created_at", { ascending: false }).limit(limit)
      ),
      queryTable(supabase, "pos_sales_events", (q) =>
        q.select("id, org_id, total_amount, status, payment_method, occurred_at, created_at").order("occurred_at", { ascending: false }).limit(limit)
      ),
    ]);
    const names = await loadOrgNames(supabase, [
      ...history.data.map((r) => r.company_id),
      ...invoicePayments.data.map((r) => r.org_id),
      ...pos.data.map((r) => r.org_id),
    ]);
    const rows = [
      ...history.data.map((r) => ({
        id: `sub-${r.id}`,
        title: "Subscription",
        type: "subscription",
        business: names.get(String(r.company_id)) || "—",
        amount: money(r.amount),
        status: r.payment_status,
        extra: r.payment_method || "PayFast",
        date: r.created_at,
      })),
      ...invoicePayments.data.map((r) => ({
        id: `inv-${r.id}`,
        title: "Invoice",
        type: "invoice",
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.amount),
        status: r.status,
        extra: r.method || "—",
        date: r.paid_at || r.created_at,
      })),
      ...pos.data.map((r) => ({
        id: `pos-${r.id}`,
        title: "POS",
        type: "pos",
        business: names.get(String(r.org_id)) || "—",
        amount: money(r.total_amount),
        status: r.status,
        extra: r.payment_method || "—",
        date: r.occurred_at || r.created_at,
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { kind: "transactions", unavailable: false, count: rows.length, rows: rows.slice(0, limit) };
  }

  if (normalized === "templates") {
    const templates = await queryTable(supabase, "quote_templates", (q) =>
      q.select("id, name, title, org_id, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (templates.unavailable) return unavailable("templates", "No platform template catalog is exposed for admin yet. Quote templates are org-scoped.");
    const names = await loadOrgNames(supabase, templates.data.map((r) => r.org_id));
    return {
      kind: "templates",
      unavailable: false,
      count: templates.count,
      rows: templates.data.map((r) => ({
        id: r.id,
        title: r.name || r.title || r.id,
        business: names.get(String(r.org_id)) || "—",
        date: r.created_at,
      })),
    };
  }

  if (normalized === "integrations") {
    const connections = await queryTable(supabase, "pos_connections", (q) =>
      q.select("id, org_id, provider, label, status, last_event_at, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (connections.unavailable) return unavailable("integrations", connections.reason);
    const names = await loadOrgNames(supabase, connections.data.map((r) => r.org_id));
    return {
      kind: "integrations",
      unavailable: false,
      count: connections.count,
      rows: connections.data.map((r) => ({
        id: r.id,
        title: r.label || r.provider,
        business: names.get(String(r.org_id)) || "—",
        status: r.status || "active",
        extra: r.provider,
        date: r.last_event_at || r.created_at,
      })),
    };
  }

  return unavailable(normalized, "Unknown directory kind");
}

function filterWindow(rows, from, to, keys) {
  return (rows || []).filter((row) => inWindow(pickTime(row, keys), from, to));
}

export async function buildAdminPlatformOverview(supabase, opts = {}) {
  const window = resolvePeriodWindow(opts.period);
  const lookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    orgs,
    orgsPrev,
    profiles,
    waitlist,
    invoices,
    quotes,
    payslips,
    invoicePayments,
    posSales,
    paymentHistory,
    failedHistory,
    refundHistory,
    intents,
    subscriptions,
    affiliateApps,
  ] = await Promise.all([
    countTable(supabase, "organizations"),
    queryTable(supabase, "organizations", (q) =>
      q.select("id, created_at").lt("created_at", window.from.toISOString()).limit(5000)
    ),
    countTable(supabase, "profiles"),
    countTable(supabase, "waitlist_signups"),
    queryTable(supabase, "invoices", (q) =>
      q.select("id, org_id, status, total, amount, created_at").order("created_at", { ascending: false }).limit(500)
    ),
    queryTable(supabase, "quotes", (q) =>
      q.select("id, org_id, status, total, amount, created_at").order("created_at", { ascending: false }).limit(300)
    ),
    queryTable(supabase, "payslips", (q) =>
      q.select("id, org_id, status, created_at").order("created_at", { ascending: false }).limit(300)
    ),
    queryTable(supabase, "payments", (q) =>
      q.select("id, org_id, amount, status, method, paid_at, created_at").order("created_at", { ascending: false }).limit(500)
    ),
    queryTable(supabase, "pos_sales_events", (q) =>
      q.select("id, org_id, total_amount, status, payment_method, occurred_at, created_at").order("occurred_at", { ascending: false }).limit(500)
    ),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, payment_status, payment_method, created_at").gte("created_at", lookback.toISOString()).order("created_at", { ascending: false }).limit(1000)
    ),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, payment_status, created_at").eq("payment_status", "failed").order("created_at", { ascending: false }).limit(20)
    ),
    queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, payment_status, created_at").eq("payment_status", "refunded").order("created_at", { ascending: false }).limit(20)
    ),
    queryTable(supabase, "payment_intents", (q) =>
      q.select("id, org_id, status, amount, source_kind, created_at").in("status", ["pending", "requires_action", "processing", "failed"]).order("created_at", { ascending: false }).limit(50)
    ),
    queryTable(supabase, "subscriptions", (q) =>
      q.select("id, status, company_id, user_id, plan, plan_slug, plan_family, amount, trial_ends_at, created_at").order("created_at", { ascending: false }).limit(500)
    ),
    queryTable(supabase, "affiliate_applications", (q) =>
      q.select("id, status").eq("status", "pending")
    ),
  ]);

  const orgRows = await queryTable(supabase, "organizations", (q) =>
    q.select("id, name, created_at").order("created_at", { ascending: false }).limit(8)
  );
  const profileRows = await queryTable(supabase, "profiles", (q) =>
    q.select("id, status, created_at, full_name, email").order("created_at", { ascending: false }).limit(200)
  );

  const docsCurrent = [
    ...filterWindow(invoices.data, window.from, window.to, ["created_at"]),
    ...filterWindow(quotes.data, window.from, window.to, ["created_at"]),
    ...filterWindow(payslips.data, window.from, window.to, ["created_at"]),
  ];
  const docsPrev = [
    ...filterWindow(invoices.data, window.prevFrom, window.prevTo, ["created_at"]),
    ...filterWindow(quotes.data, window.prevFrom, window.prevTo, ["created_at"]),
    ...filterWindow(payslips.data, window.prevFrom, window.prevTo, ["created_at"]),
  ];

  const paidInvoicePayments = invoicePayments.data.filter((r) => paidLike(r.status));
  const completedPos = posSales.data.filter((r) => !failedLike(r.status));
  const completedSubs = paymentHistory.data.filter((r) => String(r.payment_status || "").toLowerCase() === "completed");

  const subscriptionRevenue = sumField(filterWindow(completedSubs, window.from, window.to, ["created_at"]), "amount");
  const subscriptionRevenuePrev = sumField(filterWindow(completedSubs, window.prevFrom, window.prevTo, ["created_at"]), "amount");
  const invoiceRevenue = sumField(filterWindow(paidInvoicePayments, window.from, window.to, ["paid_at", "created_at"]), "amount");
  const invoiceRevenuePrev = sumField(filterWindow(paidInvoicePayments, window.prevFrom, window.prevTo, ["paid_at", "created_at"]), "amount");
  const posRevenue = sumField(filterWindow(completedPos, window.from, window.to, ["occurred_at", "created_at"]), "total_amount");
  const posRevenuePrev = sumField(filterWindow(completedPos, window.prevFrom, window.prevTo, ["occurred_at", "created_at"]), "total_amount");

  const monthlyRevenue = money(subscriptionRevenue + invoiceRevenue + posRevenue);
  const monthlyRevenuePrev = money(subscriptionRevenuePrev + invoiceRevenuePrev + posRevenuePrev);

  const paymentsProcessed = filterWindow(
    [
      ...completedSubs.map((r) => ({ ...r, _t: r.created_at })),
      ...paidInvoicePayments.map((r) => ({ ...r, _t: r.paid_at || r.created_at })),
      ...completedPos.map((r) => ({ ...r, _t: r.occurred_at || r.created_at })),
    ],
    window.from,
    window.to,
    ["_t"]
  ).length;
  const paymentsProcessedPrev = filterWindow(
    [
      ...completedSubs.map((r) => ({ ...r, _t: r.created_at })),
      ...paidInvoicePayments.map((r) => ({ ...r, _t: r.paid_at || r.created_at })),
      ...completedPos.map((r) => ({ ...r, _t: r.occurred_at || r.created_at })),
    ],
    window.prevFrom,
    window.prevTo,
    ["_t"]
  ).length;

  const orgsCreatedPrev = orgsPrev.data.length;
  const activeBusinesses = orgs.unavailable ? null : orgs.count;
  const platformUsers = profiles.unavailable ? null : profiles.count;

  const trialSubs = subscriptions.data.filter((s) => String(s.status || "").toLowerCase() === "trialing");
  const pastDue = subscriptions.data.filter((s) => ["past_due", "failed", "suspended"].includes(String(s.status || "").toLowerCase()));
  const pendingIntents = intents.data.filter((i) => ["pending", "requires_action", "processing"].includes(String(i.status || "").toLowerCase()));
  const failedIntents = intents.data.filter((i) => String(i.status || "").toLowerCase() === "failed");
  const suspendedUsers = profileRows.data.filter((p) => String(p.status || "").toLowerCase() === "suspended");

  const failedPaymentCount = failedHistory.unavailable ? null : failedHistory.count;
  const attentionCount =
    (failedPaymentCount || 0) +
    pastDue.length +
    failedIntents.length +
    suspendedUsers.length +
    (affiliateApps.unavailable ? 0 : affiliateApps.data.length);
  const criticalCount = (failedPaymentCount || 0) > 5 || failedIntents.length > 3 ? 1 : 0;

  const orgNames = await loadOrgNames(supabase, [
    ...orgRows.data.map((o) => o.id),
    ...failedHistory.data.map((r) => r.company_id),
    ...intents.data.map((r) => r.org_id),
    ...invoices.data.map((r) => r.org_id),
    ...paidInvoicePayments.map((r) => r.org_id),
    ...completedPos.map((r) => r.org_id),
    ...subscriptions.data.map((r) => r.company_id),
  ]);

  const attention = [
    ...failedHistory.data.map((r) => ({
      id: `failed-${r.id}`,
      issue: "Payment failed",
      entity: orgNames.get(String(r.company_id)) || "Unknown business",
      amount: money(r.amount),
      severity: "critical",
      date: r.created_at,
      href: "/admin-v2/failed-payments",
      action: "Review",
    })),
    ...pastDue.slice(0, 8).map((s) => ({
      id: `sub-${s.id}`,
      issue: `Subscription ${s.status}`,
      entity: orgNames.get(String(s.company_id)) || s.plan_slug || "Subscription",
      amount: money(s.amount),
      severity: "attention",
      date: s.created_at,
      href: "/admin-v2/subscriptions",
      action: "Review",
    })),
    ...failedIntents.slice(0, 8).map((i) => ({
      id: `intent-${i.id}`,
      issue: "Payment intent failed",
      entity: orgNames.get(String(i.org_id)) || i.source_kind,
      amount: money(i.amount),
      severity: "critical",
      date: i.created_at,
      href: "/admin-v2/payment-intents",
      action: "Review",
    })),
    ...suspendedUsers.slice(0, 6).map((u) => ({
      id: `user-${u.id}`,
      issue: "Suspended account",
      entity: u.full_name || u.email || u.id,
      amount: null,
      severity: "attention",
      date: u.created_at,
      href: "/admin-v2/users",
      action: "Review",
    })),
    ...affiliateApps.data.slice(0, 5).map((a) => ({
      id: `aff-${a.id}`,
      issue: "Affiliate application pending",
      entity: "Affiliate program",
      amount: null,
      severity: "attention",
      date: null,
      href: "/admin-v2/affiliates",
      action: "Review",
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8);

  const activity = [
    ...orgRows.data.map((o) => ({
      id: `biz-${o.id}`,
      event: "Business registered",
      entity: orgName(o),
      date: o.created_at,
      href: "/admin-v2/businesses",
    })),
    ...subscriptions.data.slice(0, 8).map((s) => ({
      id: `subact-${s.id}`,
      event: `Subscription ${s.status}`,
      entity: orgNames.get(String(s.company_id)) || s.plan_family || s.plan || "Plan",
      date: s.created_at,
      href: "/admin-v2/subscriptions",
    })),
    ...invoices.data.filter((inv) => paidLike(inv.status)).slice(0, 8).map((inv) => ({
      id: `invact-${inv.id}`,
      event: "Invoice paid",
      entity: orgNames.get(String(inv.org_id)) || "Business",
      date: inv.created_at,
      href: "/admin-v2/invoices",
    })),
    ...failedHistory.data.slice(0, 5).map((r) => ({
      id: `failact-${r.id}`,
      event: "Payment failed",
      entity: orgNames.get(String(r.company_id)) || "Business",
      date: r.created_at,
      href: "/admin-v2/failed-payments",
    })),
    ...completedPos.slice(0, 6).map((r) => ({
      id: `posact-${r.id}`,
      event: "POS transaction processed",
      entity: orgNames.get(String(r.org_id)) || "Business",
      date: r.occurred_at || r.created_at,
      href: "/admin-v2/pos",
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 10);

  const recentBusinesses = orgRows.data.map((o) => {
    const sub = subscriptions.data.find((s) => String(s.company_id) === String(o.id));
    return {
      id: o.id,
      business: orgName(o),
      plan: sub?.plan_family || sub?.plan_slug || sub?.plan || "none",
      status: sub?.status || "none",
      users: null,
      documents: invoices.data.filter((inv) => String(inv.org_id) === String(o.id)).length,
      revenue: money(
        paidInvoicePayments
          .filter((p) => String(p.org_id) === String(o.id))
          .reduce((sum, p) => sum + money(p.amount), 0)
      ),
      date: o.created_at,
    };
  });

  const recentTransactions = [
    ...completedSubs.slice(0, 6).map((r) => ({
      id: `tx-sub-${r.id}`,
      title: "Subscription",
      type: "subscription",
      business: orgNames.get(String(r.company_id)) || "—",
      amount: money(r.amount),
      status: r.payment_status,
      extra: r.payment_method || "PayFast",
      date: r.created_at,
    })),
    ...paidInvoicePayments.slice(0, 6).map((r) => ({
      id: `tx-inv-${r.id}`,
      title: "Invoice",
      type: "invoice",
      business: orgNames.get(String(r.org_id)) || "—",
      amount: money(r.amount),
      status: r.status,
      extra: r.method || "—",
      date: r.paid_at || r.created_at,
    })),
    ...completedPos.slice(0, 6).map((r) => ({
      id: `tx-pos-${r.id}`,
      title: "POS",
      type: "pos",
      business: orgNames.get(String(r.org_id)) || "—",
      amount: money(r.total_amount),
      status: r.status,
      extra: r.payment_method || "—",
      date: r.occurred_at || r.created_at,
    })),
    ...refundHistory.data.slice(0, 4).map((r) => ({
      id: `tx-ref-${r.id}`,
      title: "Refund",
      type: "refund",
      business: orgNames.get(String(r.company_id)) || "—",
      amount: money(r.amount),
      status: r.payment_status,
      extra: "PayFast",
      date: r.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 8);

  const sparkDays = [];
  for (let i = 6; i >= 0; i -= 1) {
    const dayFrom = addDaysUtc(startOfUtcDayNow(), -i);
    const dayTo = addDaysUtc(dayFrom, 1);
    sparkDays.push(
      money(
        sumField(filterWindow(completedSubs, dayFrom, dayTo, ["created_at"]), "amount") +
          sumField(filterWindow(paidInvoicePayments, dayFrom, dayTo, ["paid_at", "created_at"]), "amount") +
          sumField(filterWindow(completedPos, dayFrom, dayTo, ["occurred_at", "created_at"]), "total_amount")
      )
    );
  }

  return {
    period: window.period,
    compareLabel: window.compareLabel,
    window: {
      from: window.from.toISOString(),
      to: window.to.toISOString(),
    },
    kpis: {
      activeBusinesses: {
        value: activeBusinesses,
        previous: orgsCreatedPrev,
        change: activeBusinesses == null ? null : percentChange(activeBusinesses, orgsCreatedPrev),
        unavailable: orgs.unavailable,
        unavailableReason: orgs.reason,
      },
      monthlyRevenue: {
        value: monthlyRevenue,
        previous: monthlyRevenuePrev,
        change: percentChange(monthlyRevenue, monthlyRevenuePrev),
        unavailable: false,
      },
      documentsProcessed: {
        value: invoices.unavailable && quotes.unavailable && payslips.unavailable ? null : docsCurrent.length,
        previous: docsPrev.length,
        change: percentChange(docsCurrent.length, docsPrev.length),
        unavailable: invoices.unavailable && quotes.unavailable && payslips.unavailable,
        unavailableReason: invoices.reason,
      },
      paymentsProcessed: {
        value: paymentsProcessed,
        previous: paymentsProcessedPrev,
        change: percentChange(paymentsProcessed, paymentsProcessedPrev),
        unavailable: false,
      },
      platformUsers: {
        value: platformUsers,
        previous: null,
        change: null,
        unavailable: profiles.unavailable,
        unavailableReason: profiles.reason,
      },
    },
    revenue: {
      period: window.period,
      compareLabel: window.compareLabel,
      sources: {
        subscription: {
          label: "Subscription Revenue",
          amount: subscriptionRevenue,
          previous: subscriptionRevenuePrev,
          change: percentChange(subscriptionRevenue, subscriptionRevenuePrev),
          source: "payment_history",
        },
        invoice: {
          label: "Invoice Revenue",
          amount: invoiceRevenue,
          previous: invoiceRevenuePrev,
          change: percentChange(invoiceRevenue, invoiceRevenuePrev),
          source: "payments",
          unavailable: invoicePayments.unavailable,
          unavailableReason: invoicePayments.reason,
        },
        pos: {
          label: "POS Revenue",
          amount: posRevenue,
          previous: posRevenuePrev,
          change: percentChange(posRevenue, posRevenuePrev),
          source: "pos_sales_events",
          unavailable: posSales.unavailable,
          unavailableReason: posSales.reason,
        },
        fees: {
          label: "Payment Fees",
          amount: null,
          unavailable: true,
          unavailableReason: "Paidly does not store a platform fee ledger yet. SaaS fees stay in PayFast settlement, not payment_intents.",
        },
        other: {
          label: "Other Revenue",
          amount: 0,
          unavailable: false,
          unavailableReason: null,
        },
      },
      total: monthlyRevenue,
      sparkline: buildSparkline(sparkDays),
    },
    health: {
      status: healthStatus({ critical: criticalCount, attention: attentionCount }),
      activeBusinesses: activeBusinesses,
      businessesOnTrial: trialSubs.length,
      businessesAtRisk: pastDue.length,
      failedPayments: failedPaymentCount,
      pendingPaymentIntents: intents.unavailable ? null : pendingIntents.length,
      waitlist: waitlist.unavailable ? null : waitlist.count,
      sources: {
        failedPayments: failedHistory.unavailable ? failedHistory.reason : null,
        paymentIntents: intents.unavailable ? intents.reason : null,
      },
    },
    attention,
    activity,
    recentBusinesses,
    recentTransactions,
    reports: {
      documents: {
        invoices: invoices.unavailable ? null : invoices.data.length,
        quotes: quotes.unavailable ? null : quotes.data.length,
        payslips: payslips.unavailable ? null : payslips.data.length,
      },
      workforce: {
        note: "Employee identity is memberships; payroll/leave/attendance are separate tables.",
      },
    },
  };
}

function startOfUtcDayNow() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export { normalizeAdminPeriod };
