/**
 * Builds the GET /api/dashboard/bootstrap JSON body (one round-trip from the browser;
 * server runs parallel PostgREST reads under the caller's JWT / RLS).
 */

const INVOICE_LIMIT = 50;
const CLIENT_LIMIT = 50;
const QUOTE_LIMIT = 100;
const PAYSLIP_LIMIT = 100;
const EXPENSE_LIMIT = 50;
const PAYMENT_LIMIT = 50;

function withDateAliases(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    created_date: row.created_at ?? row.created_date,
    updated_date: row.updated_at ?? row.updated_date,
  };
}

function mapRows(rows) {
  return Array.isArray(rows) ? rows.map(withDateAliases) : [];
}

function resolveBusinessGoalsUserIdFromProfile(profile, fallbackUserId) {
  if (!profile || typeof profile !== "object") return fallbackUserId;
  const raw = profile.supabase_id ?? profile.auth_id ?? profile.id ?? fallbackUserId;
  if (raw == null) return fallbackUserId;
  const s = String(raw).trim();
  return s || fallbackUserId;
}

function logNonFatal(label, err) {
  if (err && process.env.NODE_ENV !== "production") {
    console.warn(`[dashboard/bootstrap] ${label}`, err.message || err);
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase — anon key + `Authorization: Bearer <jwt>`
 * @param {{ userId: string, calendarYear: number }} ctx
 */
export async function buildDashboardBootstrapPayload(supabase, ctx) {
  const userId = String(ctx?.userId || "").trim();
  const calendarYear = Number(ctx?.calendarYear) || new Date().getFullYear();
  if (!userId) {
    throw new Error("missing_user_id");
  }

  const [
    profileRes,
    membershipRes,
    invoicesRes,
    clientsRes,
    quotesRes,
    payslipsRes,
    expensesRes,
    paymentsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle(),
    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(INVOICE_LIMIT),
    supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(CLIENT_LIMIT),
    supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(QUOTE_LIMIT),
    supabase
      .from("payslips")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAYSLIP_LIMIT),
    supabase
      .from("expenses")
      .select("*")
      .order("date", { ascending: false })
      .limit(EXPENSE_LIMIT),
    supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAYMENT_LIMIT),
  ]);

  if (profileRes.error) throw profileRes.error;

  const profile = profileRes.data || null;
  const memRow = membershipRes.data;
  let organization = null;
  if (!membershipRes.error && memRow?.org_id) {
    const orgRes = await supabase.from("organizations").select("*").eq("id", memRow.org_id).maybeSingle();
    if (!orgRes.error) organization = orgRes.data || null;
    else logNonFatal("organizations", orgRes.error);
  } else if (membershipRes.error) {
    logNonFatal("memberships", membershipRes.error);
  }

  const goalUid = resolveBusinessGoalsUserIdFromProfile(profile, userId);
  let businessGoal = null;
  if (goalUid) {
    const gRes = await supabase
      .from("business_goals")
      .select("id, year, annual_target, strategy_type")
      .eq("user_id", goalUid)
      .eq("year", calendarYear)
      .maybeSingle();
    if (!gRes.error && gRes.data && Number(gRes.data.year) === calendarYear) {
      businessGoal = gRes.data;
    } else if (gRes.error) {
      logNonFatal("business_goals", gRes.error);
    }
  }

  if (invoicesRes.error) logNonFatal("invoices", invoicesRes.error);
  if (clientsRes.error) logNonFatal("clients", clientsRes.error);
  if (quotesRes.error) logNonFatal("quotes", quotesRes.error);
  if (payslipsRes.error) logNonFatal("payslips", payslipsRes.error);
  if (expensesRes.error) logNonFatal("expenses", expensesRes.error);
  if (paymentsRes.error) logNonFatal("payments", paymentsRes.error);

  const recentInvoices = mapRows(!invoicesRes.error ? invoicesRes.data : []);
  const clients = mapRows(!clientsRes.error ? clientsRes.data : []);
  const quotes = mapRows(!quotesRes.error ? quotesRes.data : []);
  const payslips = mapRows(!payslipsRes.error ? payslipsRes.data : []);
  const expenses = mapRows(!expensesRes.error ? expensesRes.data : []);
  const payments = mapRows(!paymentsRes.error ? paymentsRes.data : []);

  const user = profile && typeof profile === "object" ? { ...profile, id: profile.id || userId } : { id: userId };

  const stats = {
    invoiceCount: recentInvoices.length,
    clientCount: clients.length,
    quoteCount: quotes.length,
    payslipCount: payslips.length,
    expenseCount: expenses.length,
    paymentCount: payments.length,
  };

  return {
    user,
    organization,
    dashboard: {
      clients,
      quotes,
      payslips,
      expenses,
      payments,
      businessGoal,
    },
    recentInvoices,
    stats,
  };
}
