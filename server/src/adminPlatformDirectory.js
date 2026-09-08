import {
  ADMIN_DIRECTORY_KINDS,
  countExact,
  isIntegerBindError,
  isMissingRelationError,
  logIntegerBindError,
  money,
  normalizeAdminPeriod,
  resolveDirectoryLimit,
  startOfUtcDay,
  startOfUtcMonth,
} from "../../shared/admin/adminPlatformDirectory.js";
import {
  planFamilyLabel,
  successRate,
} from "../../shared/admin/adminPlatformMetrics.js";

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
      if (isIntegerBindError(result.error)) {
        logIntegerBindError("admin-directory", {
          table,
          operation: "select",
          message: result.error.message,
        });
      }
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

function isMissingColumnError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || error || "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("is_internal");
}

async function countCustomerOrgs(supabase) {
  const filtered = await queryTable(supabase, "organizations", (q) =>
    q.select("id", { count: "exact", head: true }).eq("is_internal", false)
  );
  if (filtered.unavailable && isMissingColumnError({ message: filtered.reason })) {
    return countTable(supabase, "organizations");
  }
  return filtered;
}

async function countInRange(supabase, table, column, from, to, apply = (q) => q) {
  return countTable(supabase, table, (q) => {
    let next = apply(q).gte(column, from.toISOString());
    if (to) next = next.lt(column, to.toISOString());
    return next;
  });
}

async function usageSnapshot(supabase, table, column = "created_at") {
  const now = new Date();
  const today = startOfUtcDay(now);
  const month = startOfUtcMonth(now);
  const [total, todayCount, monthCount] = await Promise.all([
    countTable(supabase, table),
    countInRange(supabase, table, column, today, null),
    countInRange(supabase, table, column, month, null),
  ]);
  return {
    total: countExact(total),
    today: countExact(todayCount),
    thisMonth: countExact(monthCount),
    unavailable: Boolean(total.unavailable),
    unavailableReason: total.reason,
  };
}

function orgName(org) {
  return String(org?.name || org?.company_name || "Untitled business").trim();
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
  const parsedLimit = resolveDirectoryLimit(opts.limit);
  if (!parsedLimit.ok) {
    logIntegerBindError("admin-directory", {
      table: normalized,
      column: "limit",
      operation: "select",
      value: opts.limit,
      valueType: typeof opts.limit,
      message: "LIMIT must be an integer row count",
    });
    return { error: "Invalid limit (use integer 1–200)", status: 400 };
  }
  const limit = parsedLimit.value;

  if (normalized === "businesses") {
    let orgs = await queryTable(supabase, "organizations", (q) =>
      q.select("id, name, industry, business_type, created_at, owner_id, is_internal").order("created_at", { ascending: false }).limit(limit)
    );
    if (orgs.unavailable && isMissingColumnError({ message: orgs.reason })) {
      orgs = await queryTable(supabase, "organizations", (q) =>
        q.select("id, name, industry, business_type, created_at, owner_id").order("created_at", { ascending: false }).limit(limit)
      );
    }
    if (orgs.unavailable) return unavailable("businesses", orgs.reason);
    const ids = orgs.data.map((o) => o.id);
    const empty = ["00000000-0000-0000-0000-000000000000"];
    const [subs, memberships, invoices, quotes, posSales, owners] = await Promise.all([
      queryTable(supabase, "subscriptions", (q) =>
        q.select("id, company_id, status, plan, plan_slug, plan_family, trial_ends_at").in("company_id", ids.length ? ids : empty)
      ),
      queryTable(supabase, "memberships", (q) =>
        q.select("id, org_id, user_id").in("org_id", ids.length ? ids : empty)
      ),
      queryTable(supabase, "invoices", (q) =>
        q.select("id, org_id, created_at").in("org_id", ids.length ? ids : empty)
      ),
      queryTable(supabase, "quotes", (q) =>
        q.select("id, org_id").in("org_id", ids.length ? ids : empty)
      ),
      queryTable(supabase, "pos_sales_events", (q) =>
        q.select("id, org_id").in("org_id", ids.length ? ids : empty)
      ),
      queryTable(supabase, "profiles", (q) =>
        q.select("id, last_active_at, role").in("id", orgs.data.map((o) => o.owner_id).filter(Boolean).length ? orgs.data.map((o) => o.owner_id).filter(Boolean) : empty)
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
    const quotesByOrg = new Map();
    const posByOrg = new Map();
    for (const inv of invoices.data) {
      const key = String(inv.org_id);
      docsByOrg.set(key, (docsByOrg.get(key) || 0) + 1);
    }
    for (const q of quotes.data) {
      const key = String(q.org_id);
      quotesByOrg.set(key, (quotesByOrg.get(key) || 0) + 1);
    }
    for (const sale of posSales.data) {
      const key = String(sale.org_id);
      posByOrg.set(key, (posByOrg.get(key) || 0) + 1);
    }
    const ownerById = new Map((owners.data || []).map((p) => [String(p.id), p]));
    return {
      kind: "businesses",
      view: "platform",
      unavailable: false,
      count: orgs.count,
      rows: orgs.data.map((o) => {
        const sub = subByOrg.get(String(o.id));
        const owner = ownerById.get(String(o.owner_id));
        const invoiceCount = docsByOrg.get(String(o.id)) || 0;
        const quoteCount = quotesByOrg.get(String(o.id)) || 0;
        const posCount = posByOrg.get(String(o.id)) || 0;
        const usage = [
          invoiceCount ? `${invoiceCount} invoices` : null,
          quoteCount ? `${quoteCount} quotes` : null,
          posCount ? "POS active" : null,
        ].filter(Boolean).join(" · ") || "No usage yet";
        return {
          id: o.id,
          title: orgName(o),
          business: orgName(o),
          plan: planFamilyLabel(sub?.plan_family || sub?.plan_slug || sub?.plan),
          status: sub?.status || "none",
          users: usersByOrg.get(String(o.id)) || 0,
          documents: invoiceCount + quoteCount,
          featureUsage: usage,
          lastActive: owner?.last_active_at || null,
          internal: Boolean(o.is_internal),
          extra: o.is_internal ? "Internal" : o.business_type || null,
          date: o.created_at,
        };
      }),
    };
  }

  if (normalized === "plans") {
    let plans = await queryTable(supabase, "plans", (q) =>
      q.select("id, slug, name, billing_cycle, amount, currency, active, is_legacy, is_public, plan_family, contact_sales, created_at").order("sort_order", { ascending: true }).limit(limit)
    );
    if (plans.unavailable) {
      plans = await queryTable(supabase, "plans", (q) =>
        q.select("id, slug, name, billing_cycle, amount, currency, active, created_at").order("amount", { ascending: true }).limit(limit)
      );
    }
    if (plans.unavailable) return unavailable("plans", plans.reason);
    const subs = await queryTable(supabase, "subscriptions", (q) =>
      q.select("id, status, plan_id, plan_slug, plan_family, amount, billing_cycle").limit(5000)
    );
    const activeByKey = new Map();
    const trialByKey = new Map();
    const mrrByKey = new Map();
    for (const s of subs.data || []) {
      const key = String(s.plan_id || s.plan_slug || "");
      if (!key) continue;
      const status = String(s.status || "").toLowerCase();
      if (status === "active") {
        activeByKey.set(key, (activeByKey.get(key) || 0) + 1);
        const monthly = s.billing_cycle === "annual" || s.billing_cycle === "yearly" ? money(s.amount) / 12 : money(s.amount);
        mrrByKey.set(key, money((mrrByKey.get(key) || 0) + monthly));
      }
      if (status === "trialing" || status === "trial") {
        trialByKey.set(key, (trialByKey.get(key) || 0) + 1);
      }
    }
    const catalog = plans.data.filter((p) => p.is_legacy !== true);
    const rowsSource = catalog.length ? catalog : plans.data;
    return {
      kind: "plans",
      view: "platform",
      unavailable: false,
      count: rowsSource.length,
      rows: rowsSource.map((p) => {
        const active = activeByKey.get(String(p.id)) || activeByKey.get(String(p.slug)) || 0;
        const trial = trialByKey.get(String(p.id)) || trialByKey.get(String(p.slug)) || 0;
        const mrr = mrrByKey.get(String(p.id)) || mrrByKey.get(String(p.slug)) || 0;
        return {
          id: p.id,
          title: p.name || p.slug,
          subtitle: p.contact_sales ? "Custom" : `${p.billing_cycle || "monthly"}`,
          plan: planFamilyLabel(p.plan_family || p.slug),
          status: p.active === false ? "inactive" : p.is_legacy ? "legacy" : "active",
          amount: p.contact_sales ? null : money(p.amount),
          users: active,
          extra: p.contact_sales ? "Custom" : `${trial} trial`,
          mrr: p.contact_sales ? null : money(mrr),
          date: p.created_at,
        };
      }),
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
    const usage = await usageSnapshot(supabase, table, "created_at");
    return {
      kind: normalized,
      view: "usage",
      usage,
      unavailable: false,
      count: docs.count,
      rows: docs.data.map((r) => ({
        id: r.id,
        title: r.invoice_number || r.quote_number || r.number || r.project_title || r.id,
        subtitle: r.client_name || null,
        business: names.get(String(r.org_id)) || "—",
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
    const [usage, enabled, connections] = await Promise.all([
      usageSnapshot(supabase, "pos_sales_events", "occurred_at"),
      countTable(supabase, "organizations", (q) => q.in("business_type", ["retail", "mixed"])),
      countTable(supabase, "pos_connections"),
    ]);
    return {
      kind: "pos",
      view: "usage",
      usage: {
        ...usage,
        enabledBusinesses: countExact(enabled),
        connections: countExact(connections),
      },
      unavailable: false,
      count: sales.count,
      rows: sales.data.map((r) => ({
        id: r.id,
        title: r.provider || "POS",
        business: names.get(String(r.org_id)) || "—",
        status: r.status || "completed",
        extra: r.payment_method || "—",
        date: r.occurred_at || r.created_at,
      })),
    };
  }

  if (normalized === "payments") {
    const payments = await queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, currency, payment_status, payment_method, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (payments.unavailable) return unavailable("payments", payments.reason);
    const names = await loadOrgNames(supabase, payments.data.map((r) => r.company_id));
    const [completed, failed, total] = await Promise.all([
      countTable(supabase, "payment_history", (q) => q.eq("payment_status", "completed")),
      countTable(supabase, "payment_history", (q) => q.eq("payment_status", "failed")),
      countTable(supabase, "payment_history"),
    ]);
    const ok = countExact(completed);
    const bad = countExact(failed);
    const all = countExact(total);
    return {
      kind: "payments",
      view: "platform",
      usage: {
        total: all,
        successful: ok,
        failed: bad,
        successRate: successRate(ok, (ok || 0) + (bad || 0)),
        unavailable: Boolean(total.unavailable),
        unavailableReason: total.reason,
      },
      unavailable: false,
      count: payments.count,
      rows: payments.data.map((r) => ({
        id: r.id,
        title: "Subscription payment",
        business: names.get(String(r.company_id)) || "—",
        amount: money(r.amount),
        status: r.payment_status || "unknown",
        extra: r.payment_method || "PayFast",
        date: r.created_at,
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
      view: "usage",
      usage: await usageSnapshot(supabase, "memberships"),
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
      view: "usage",
      usage: await usageSnapshot(supabase, "payroll_profiles"),
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
      view: "usage",
      usage: await usageSnapshot(supabase, "leave_requests"),
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
      view: "usage",
      usage: await usageSnapshot(supabase, "attendance_profiles"),
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
    const [total, successful, pending, failed] = await Promise.all([
      countTable(supabase, "payment_intents"),
      countTable(supabase, "payment_intents", (q) => q.in("status", ["succeeded", "completed", "paid"])),
      countTable(supabase, "payment_intents", (q) => q.in("status", ["pending", "requires_action", "processing"])),
      countTable(supabase, "payment_intents", (q) => q.eq("status", "failed")),
    ]);
    const ok = countExact(successful);
    const bad = countExact(failed);
    return {
      kind: "payment-intents",
      view: "operations",
      usage: {
        total: countExact(total),
        successful: ok,
        pending: countExact(pending),
        failed: bad,
        successRate: successRate(ok, (ok || 0) + (bad || 0)),
      },
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
    const history = await queryTable(supabase, "payment_history", (q) =>
      q.select("id, company_id, amount, currency, payment_status, payment_method, created_at").order("created_at", { ascending: false }).limit(limit)
    );
    if (history.unavailable) return unavailable("transactions", history.reason);
    const names = await loadOrgNames(supabase, history.data.map((r) => r.company_id));
    const rows = history.data.map((r) => ({
      id: r.id,
      title: r.payment_status === "refunded" ? "Refund" : "Subscription payment",
      type: r.payment_status === "refunded" ? "refund" : "subscription",
      business: names.get(String(r.company_id)) || "—",
      amount: money(r.amount),
      status: r.payment_status,
      extra: r.payment_method || "PayFast",
      date: r.created_at,
    }));
    return { kind: "transactions", view: "platform", unavailable: false, count: history.count, rows };
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

export { buildAdminPlatformOverview } from "./adminPlatformOverview.js";
export { normalizeAdminPeriod };
