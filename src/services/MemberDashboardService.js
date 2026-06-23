import { supabase } from "@/lib/supabaseClient";
import { promiseWithTimeout } from "@/utils/fetchWithTimeout";
import { listCompanyMembers } from "@/services/CompanyContextService";
import {
  RECENT_LIMIT,
  LEAVE_DOCUMENT_TYPE,
  PENDING_LEAVE_STATUSES,
  NON_MEMBER_DOC_TYPES,
  postgrestInList,
  assembleSelfWorkspaceSummary,
  assembleCompanyWorkspaceSummary,
} from "@/services/memberDashboardSummary";

/**
 * Role-scoped data for the unified company dashboard.
 *
 * Separation of "my" vs "company" data is enforced by RLS (can_read_payslip_row /
 * can_read_document_row): employees can only read their own rows, managers/admins read the
 * whole org. The "self" fetchers additionally pin to the current user with explicit owner
 * filters, so an admin still sees only their own records under "My workspace".
 *
 * Pure view-model shaping lives in ./memberDashboardSummary (dependency-free, unit-tested).
 */

const FETCH_TIMEOUT_MS = 20_000;

const PAYSLIP_FIELDS =
  "id, payslip_number, employee_name, status, net_pay, pay_date, created_at";
const DOCUMENT_FIELDS =
  "id, type, status, document_number, title, total_amount, created_at";

async function runQuery(buildQuery) {
  try {
    const result = await promiseWithTimeout(() => buildQuery(), FETCH_TIMEOUT_MS);
    if (result?.error) return { data: [], count: 0 };
    return { data: result?.data ?? [], count: result?.count ?? 0 };
  } catch {
    return { data: [], count: 0 };
  }
}

async function runHeadCount(buildQuery) {
  try {
    const result = await promiseWithTimeout(() => buildQuery(), FETCH_TIMEOUT_MS);
    if (result?.error) return 0;
    return Number(result?.count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * The signed-in user's OWN records (payslips, leave, personal/company documents) for their org.
 * Correct for every role — admins see only their own here.
 * @param {{ userId: string, companyId: string }} args
 */
export async function fetchSelfWorkspaceSummary({ userId, companyId } = {}) {
  if (!userId || !companyId) {
    return assembleSelfWorkspaceSummary({});
  }

  const ownerDocFilter = `created_by.eq.${userId},user_id.eq.${userId},assigned_user_id.eq.${userId}`;

  const [payslips, leave, leavePending, documents] = await Promise.all([
    runQuery(() =>
      supabase
        .from("payslips")
        .select(PAYSLIP_FIELDS, { count: "exact" })
        .eq("org_id", companyId)
        .or(`employee_user_id.eq.${userId},user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT)
    ),
    runQuery(() =>
      supabase
        .from("documents")
        .select(DOCUMENT_FIELDS, { count: "exact" })
        .eq("org_id", companyId)
        .eq("type", LEAVE_DOCUMENT_TYPE)
        .or(ownerDocFilter)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT)
    ),
    runHeadCount(() =>
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", companyId)
        .eq("type", LEAVE_DOCUMENT_TYPE)
        .in("status", [...PENDING_LEAVE_STATUSES])
        .or(ownerDocFilter)
    ),
    runQuery(() =>
      supabase
        .from("documents")
        .select(DOCUMENT_FIELDS, { count: "exact" })
        .eq("org_id", companyId)
        .not("type", "in", postgrestInList(NON_MEMBER_DOC_TYPES))
        .or(ownerDocFilter)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT)
    ),
  ]);

  return assembleSelfWorkspaceSummary({ payslips, leave, leavePending, documents });
}

/**
 * Company-wide records for managers/admins. Relies on RLS for org scoping (no owner filter),
 * so employees who reach it would only see their own rows — but callers gate on VIEW_TEAM_MEMBERS.
 * @param {import('@/lib/companyPermissions').CompanyAccessContext} ctx
 */
export async function fetchCompanyWorkspaceSummary(ctx) {
  const companyId = ctx?.companyId;
  if (!companyId) return assembleCompanyWorkspaceSummary({});

  const [members, pendingLeave, payslips, documents] = await Promise.all([
    listCompanyMembers(ctx).catch(() => []),
    runHeadCount(() =>
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", companyId)
        .eq("type", LEAVE_DOCUMENT_TYPE)
        .in("status", [...PENDING_LEAVE_STATUSES])
    ),
    runHeadCount(() =>
      supabase.from("payslips").select("id", { count: "exact", head: true }).eq("org_id", companyId)
    ),
    runHeadCount(() =>
      supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("org_id", companyId)
        .not("type", "in", postgrestInList(NON_MEMBER_DOC_TYPES))
    ),
  ]);

  return assembleCompanyWorkspaceSummary({ members, pendingLeave, payslips, documents });
}
