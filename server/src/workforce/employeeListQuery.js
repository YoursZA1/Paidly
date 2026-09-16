import { supabaseAdmin } from "../supabaseAdmin.js";
import { johannesburgYmd } from "../../../shared/payroll/dates.js";
import { computeLeaveBalance } from "../../../shared/leave/leaveMath.js";
import { buildEmployeeProfile } from "../../../shared/workforce/employeeProfile.js";
import { mergeEmployeeTimeline } from "../../../shared/workforce/employeeTimeline.js";
import { countEmployeesOnLeaveToday, deriveEmployeeLeaveStatus } from "../../../shared/workforce/leaveStatus.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { assertOwnEmployee, assertSameOrg } from "./workforceAuth.js";
import { throwIfMissingWorkforceColumn } from "./schemaGuard.js";
import { loadOutstandingAdjustmentSignals } from "./adjustmentSignals.js";
import {
  eligibleManagersFromRoster,
} from "../../../shared/workforce/employeeLifecycle.js";
import {
  directoryFacets,
  filterWorkforceDirectory,
  paginateRows,
  sortWorkforceDirectory,
} from "../../../shared/workforce/directory.js";
import { displayPayslipStatus } from "../../../shared/payroll/payslipStatus.js";
import { normalizeCompanyRole, normalizeJobFunction } from "../companyRouteAccess.js";
import { ensureAttendanceProfile } from "./employeeProvisioning.js";
import { membershipIsPosEnabled } from "../../../shared/posStaffInvite.js";
import { PORTAL_STATUS } from "../../../shared/workforce/portalAccess.js";

const MEMBER_EXPANDED_COLS =
  "id, user_id, role, job_function, employee_number, department, employment_status, employment_start_date, employment_end_date, manager_membership_id, invited_email, invited_name, job_title, disabled_at, portal_revoked_at, pos_pin_hash, pos_pin_locked_until, pos_register_id, created_at";
const MEMBER_LEGACY_COLS =
  "id, user_id, role, job_function, employee_number, department, employment_status, employment_start_date, invited_email, disabled_at, created_at";
const PAYROLL_LIST_COLS =
  "id, membership_id, user_id, employee_number, full_name, email, job_title, department, base_salary, hourly_rate, daily_rate, pay_type, pay_frequency, employment_status, payroll_status";

const PROFILE_SECTIONS = Object.freeze([
  "leave",
  "payslips",
  "documents",
  "attendance",
  "activity",
]);

function safeQuery(promise, fallback) {
  return promise.then((res) => res).catch(() => fallback);
}

async function loadOrgMemberships(orgId) {
  let membersQuery = await supabaseAdmin
    .from("memberships")
    .select(MEMBER_EXPANDED_COLS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (membersQuery.error && /invited_name|job_title|employment_end_date|manager_membership_id|portal_revoked_at|pos_pin|pos_register_id|schema cache|column/i.test(membersQuery.error.message || "")) {
    membersQuery = await supabaseAdmin
      .from("memberships")
      .select(MEMBER_LEGACY_COLS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
  }
  if (membersQuery.error) throw membersQuery.error;
  return membersQuery.data || [];
}

async function loadMembershipById(orgId, employeeId) {
  let query = await supabaseAdmin
    .from("memberships")
    .select(MEMBER_EXPANDED_COLS)
    .eq("org_id", orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (query.error && /invited_name|job_title|employment_end_date|manager_membership_id|portal_revoked_at|pos_pin|pos_register_id|schema cache|column/i.test(query.error.message || "")) {
    query = await supabaseAdmin
      .from("memberships")
      .select(MEMBER_LEGACY_COLS)
      .eq("org_id", orgId)
      .eq("id", employeeId)
      .maybeSingle();
  }
  if (query.error) throw query.error;
  return query.data || null;
}

function scopeMemberships(members, managerScopeId) {
  if (!managerScopeId) return members;
  return members.filter((m) => m.id === managerScopeId || m.manager_membership_id === managerScopeId);
}

async function loadPeopleByUserIds(userIds) {
  if (!userIds.length) return new Map();
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone, job_title, department")
    .in("id", userIds);
  return new Map((profiles || []).map((p) => [p.id, p]));
}

async function loadPayrollByMembership(orgId) {
  const { data: payrollRows } = await supabaseAdmin
    .from("payroll_profiles")
    .select(PAYROLL_LIST_COLS)
    .eq("org_id", orgId);
  return new Map((payrollRows || []).map((p) => [p.membership_id, p]));
}

function shapeEmployeeRow({
  membership,
  person,
  payroll,
  managerMem,
  managerPerson,
  attendance,
  leaveAvailable,
  payslipCount,
  leaveStatus,
  actorMembershipId,
  canManagePayroll,
  pendingInvite = null,
}) {
  const managerName =
    managerPerson?.full_name || managerMem?.invited_name || managerMem?.invited_email || null;
  const profile = buildEmployeeProfile(
    {
      membership: {
        ...membership,
        role: normalizeCompanyRole(membership.role),
        job_function: normalizeJobFunction(membership.job_function),
      },
      profile: person,
      payrollProfile: payroll,
      attendance,
      leaveAvailable,
      payslipCount,
      pendingInvite,
      posAccess: membershipIsPosEnabled({
        companyRole: membership.role,
        job_function: membership.job_function,
        pos_register_id: membership.pos_register_id,
      }),
      manager: managerMem
        ? {
            id: managerMem.id,
            full_name: managerName,
            label: managerName,
            employment_status: managerMem.employment_status,
            disabled_at: managerMem.disabled_at,
            role: managerMem.role,
            job_function: managerMem.job_function,
          }
        : null,
    },
    { actorMembershipId, canManagePayroll }
  );
  return {
    ...profile,
    leave_status: leaveStatus || "none",
  };
}

async function loadPendingInvitesByMembership(orgId, membershipIds) {
  const map = new Map();
  if (!membershipIds.length) return map;
  try {
    const { data, error } = await supabaseAdmin
      .from("company_invites")
      .select("id, membership_id, status, revoked_at, expires_at, token, email")
      .eq("org_id", orgId)
      .in("membership_id", membershipIds)
      .eq("status", "pending")
      .is("revoked_at", null);
    if (error) return map;
    const now = Date.now();
    for (const row of data || []) {
      if (!row.membership_id) continue;
      if (row.expires_at && new Date(row.expires_at).getTime() <= now) continue;
      if (!map.has(row.membership_id)) map.set(row.membership_id, row);
    }
  } catch {
    return map;
  }
  return map;
}

async function loadLeaveStatusByEmployee(orgId, employeeIds) {
  const map = new Map();
  if (!employeeIds.length) return map;
  try {
    const requests = await supabaseAdmin
      .from("leave_requests")
      .select("employee_id, status, start_date, end_date")
      .eq("org_id", orgId)
      .in("employee_id", employeeIds);
    const todayIso = johannesburgYmd().iso;
    const grouped = new Map();
    for (const row of requests.data || []) {
      if (!row.employee_id) continue;
      const list = grouped.get(row.employee_id) || [];
      list.push(row);
      grouped.set(row.employee_id, list);
    }
    for (const [id, rows] of grouped) {
      map.set(id, deriveEmployeeLeaveStatus(rows, todayIso));
    }
  } catch {
    return map;
  }
  return map;
}

async function loadAttendanceByEmployee(employeeIds) {
  const map = new Map();
  if (!employeeIds.length) return map;
  try {
    const attendance = await supabaseAdmin
      .from("attendance_profiles")
      .select("employee_id, status")
      .in("employee_id", employeeIds);
    for (const row of attendance.data || []) {
      map.set(row.employee_id, row);
    }
  } catch {
    return map;
  }
  return map;
}

function parseListLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function parseListOffset(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export async function listEmployees(orgId, opts = {}) {
  const {
    actorMembershipId = null,
    canManagePayroll = false,
    managerScopeId = null,
    q = "",
    department = "",
    status = "",
    managerId = "",
    jobTitle = "",
    leaveStatus = "",
    attention = false,
    sort = "name",
    limit = 50,
    offset = 0,
    includeLeaveStatus = true,
    includeAttendance = false,
    pageAll = false,
  } = opts;

  const members = await loadOrgMemberships(orgId);
  const scoped = scopeMemberships(members, managerScopeId);
  const userIds = scoped.map((m) => m.user_id).filter(Boolean);
  const managerIds = scoped.map((m) => m.manager_membership_id).filter(Boolean);
  const missingManagerIds = managerIds.filter((id) => !members.some((m) => m.id === id));
  let extraManagers = [];
  if (missingManagerIds.length) {
    const extra = await supabaseAdmin
      .from("memberships")
      .select(MEMBER_EXPANDED_COLS)
      .eq("org_id", orgId)
      .in("id", missingManagerIds);
    extraManagers = extra.data || [];
  }
  const memberById = new Map([...members, ...extraManagers].map((m) => [m.id, m]));
  const extraUserIds = extraManagers.map((m) => m.user_id).filter(Boolean);
  const [byUser, payrollByMembership] = await Promise.all([
    loadPeopleByUserIds([...new Set([...userIds, ...extraUserIds])]),
    loadPayrollByMembership(orgId),
  ]);

  const employeeIds = scoped.map((m) => m.id).filter(Boolean);
  const needsLeave = includeLeaveStatus || Boolean(leaveStatus);
  const [leaveByEmployee, attendanceByEmployee, pendingByMembership] = await Promise.all([
    needsLeave ? loadLeaveStatusByEmployee(orgId, employeeIds) : Promise.resolve(new Map()),
    includeAttendance ? loadAttendanceByEmployee(employeeIds) : Promise.resolve(new Map()),
    loadPendingInvitesByMembership(orgId, employeeIds),
  ]);

  const rows = scoped.map((m) =>
    shapeEmployeeRow({
      membership: m,
      person: byUser.get(m.user_id),
      payroll: payrollByMembership.get(m.id),
      managerMem: m.manager_membership_id ? memberById.get(m.manager_membership_id) : null,
      managerPerson: m.manager_membership_id
        ? byUser.get(memberById.get(m.manager_membership_id)?.user_id)
        : null,
      attendance: attendanceByEmployee.get(m.id) || null,
      leaveAvailable: null,
      payslipCount: 0,
      leaveStatus: leaveByEmployee.get(m.id) || "none",
      actorMembershipId,
      canManagePayroll,
      pendingInvite: pendingByMembership.get(m.id) || null,
    })
  );

  const facets = directoryFacets(rows);
  const filtered = sortWorkforceDirectory(
    filterWorkforceDirectory(rows, {
      q,
      department,
      status,
      managerId,
      jobTitle,
      leaveStatus,
      attention,
    }),
    sort
  );
  const page = pageAll
    ? { items: filtered, total: filtered.length, limit: filtered.length, offset: 0 }
    : paginateRows(filtered, { limit: parseListLimit(limit), offset: parseListOffset(offset) });
  return {
    ...page,
    facets,
    eligible_managers: eligibleManagersFromRoster(rows),
  };
}

export async function listEligibleManagers(orgId, { excludeId = null, managerScopeId = null } = {}) {
  const members = await loadOrgMemberships(orgId);
  const scoped = scopeMemberships(members, managerScopeId);
  const eligible = eligibleManagersFromRoster(scoped, { excludeId });
  const userIds = eligible.map((m) => m.user_id).filter(Boolean);
  const byUser = await loadPeopleByUserIds(userIds);
  return eligible.map((m) => {
    const person = byUser.get(m.user_id);
    const name = person?.full_name || m.invited_name || m.invited_email || "Manager";
    return {
      id: m.id,
      employee_id: m.id,
      membership_id: m.id,
      full_name: name,
      label: name,
      employee_number: m.employee_number || null,
      role: m.role,
      job_function: m.job_function,
      employment_status: m.employment_status,
      department: m.department || null,
    };
  });
}

export async function getEmployee(orgId, employeeId, { actorUserId, actorMembershipId, canViewTeam, canManagePayroll = false } = {}) {
  const membership = await loadMembershipById(orgId, employeeId);
  if (!membership) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  assertSameOrg({ companyId: orgId }, { org_id: orgId });
  const managerMem = membership.manager_membership_id
    ? await loadMembershipById(orgId, membership.manager_membership_id)
    : null;
  const userIds = [membership.user_id, managerMem?.user_id].filter(Boolean);
  const [byUser, payrollRows, pendingByMembership] = await Promise.all([
    loadPeopleByUserIds(userIds),
    supabaseAdmin
      .from("payroll_profiles")
      .select(PAYROLL_LIST_COLS)
      .eq("org_id", orgId)
      .eq("membership_id", membership.id)
      .maybeSingle(),
    loadPendingInvitesByMembership(orgId, [membership.id]),
  ]);
  const row = shapeEmployeeRow({
    membership,
    person: byUser.get(membership.user_id),
    payroll: payrollRows.data,
    managerMem,
    managerPerson: managerMem ? byUser.get(managerMem.user_id) : null,
    attendance: null,
    leaveAvailable: null,
    payslipCount: 0,
    leaveStatus: "none",
    actorMembershipId,
    canManagePayroll,
    pendingInvite: pendingByMembership.get(membership.id) || null,
  });
  assertOwnEmployee({ userId: actorUserId, id: actorMembershipId }, row, { canViewTeam });
  return row;
}

function redactPayslipRow(row, canSeePay) {
  const status = displayPayslipStatus(row);
  if (canSeePay) {
    return {
      id: row.id,
      payslip_number: row.payslip_number,
      pay_period_start: row.pay_period_start,
      pay_period_end: row.pay_period_end,
      pay_date: row.pay_date,
      net_pay: row.net_pay,
      gross_pay: row.gross_pay,
      status,
      raw_status: row.status || null,
      public_share_token: row.public_share_token || null,
      locked: Boolean(row.locked || row.pay_run_id),
    };
  }
  return {
    id: row.id,
    payslip_number: row.payslip_number,
    pay_period_start: row.pay_period_start,
    pay_period_end: row.pay_period_end,
    pay_date: row.pay_date,
    status,
    raw_status: row.status || null,
    locked: Boolean(row.locked || row.pay_run_id),
    compensation_redacted: true,
  };
}

function parseSections(raw) {
  const text = String(raw || "").trim().toLowerCase();
  if (!text || text === "profile") return new Set(PROFILE_SECTIONS);
  const wanted = new Set();
  for (const part of text.split(",")) {
    const key = part.trim();
    if (PROFILE_SECTIONS.includes(key)) wanted.add(key);
  }
  return wanted;
}

export async function getEmployeeProfile(orgId, employeeId, access, { sections } = {}) {
  const employee = await getEmployee(orgId, employeeId, access);
  const canSeePay = Boolean(access.canManagePayroll || employee.id === access.actorMembershipId);
  const wanted = parseSections(sections);
  const bundle = { employee };

  const jobs = [];
  if (wanted.has("leave")) {
    jobs.push(
      (async () => {
        const [requests, balances] = await Promise.all([
          safeQuery(
            supabaseAdmin
              .from("leave_requests")
              .select("id, status, start_date, end_date, working_days, reason, leave_types(name, code, paid)")
              .eq("org_id", orgId)
              .eq("employee_id", employee.id)
              .order("start_date", { ascending: false })
              .limit(50),
            { data: [] }
          ),
          safeQuery(
            supabaseAdmin
              .from("leave_balances")
              .select("id, accrued, used, pending, entitled, leave_year, leave_types(code, name)")
              .eq("org_id", orgId)
              .eq("employee_id", employee.id)
              .eq("leave_year", johannesburgYmd().year),
            { data: [] }
          ),
        ]);
        bundle.leave_requests = requests.data || [];
        bundle.leave_balances = (balances.data || []).map((row) => ({
          ...row,
          available: computeLeaveBalance(row).available,
        }));
      })()
    );
  }
  if (wanted.has("payslips")) {
    jobs.push(
      (async () => {
        const payslipRes = await safeQuery(
          supabaseAdmin
            .from("payslips")
            .select(
              "id, payslip_number, pay_period_start, pay_period_end, pay_date, net_pay, gross_pay, locked, pay_run_id, membership_id, status, public_share_token"
            )
            .eq("org_id", orgId)
            .eq("membership_id", employee.id)
            .order("pay_period_start", { ascending: false })
            .limit(50),
          { data: [] }
        );
        bundle.payslips = (payslipRes.data || []).map((row) => redactPayslipRow(row, canSeePay));
      })()
    );
  }
  if (wanted.has("documents")) {
    jobs.push(
      (async () => {
        const docRes = await safeQuery(
          supabaseAdmin
            .from("documents")
            .select("id, type, title, status, created_at, membership_id")
            .eq("org_id", orgId)
            .eq("membership_id", employee.id)
            .order("created_at", { ascending: false })
            .limit(50),
          { data: [] }
        );
        bundle.documents = docRes.data || [];
      })()
    );
  }
  if (wanted.has("attendance")) {
    jobs.push(
      (async () => {
        let attendance = null;
        try {
          attendance = await ensureAttendanceProfile(orgId, { id: employee.id }, { id: employee.payroll_profile_id });
        } catch {
          attendance = null;
        }
        const fallback = await safeQuery(
          supabaseAdmin
            .from("attendance_profiles")
            .select("employee_id, status, created_at, updated_at")
            .eq("employee_id", employee.id)
            .maybeSingle(),
          { data: null }
        );
        bundle.attendance = attendance || fallback.data || { status: employee.attendance_status || "unprovisioned" };
      })()
    );
  }
  if (wanted.has("activity")) {
    jobs.push(
      (async () => {
        const [auditRes, eventRes] = await Promise.all([
          safeQuery(
            supabaseAdmin
              .from("workforce_audit_logs")
              .select("id, action, before_state, after_state, event_id, created_at")
              .eq("org_id", orgId)
              .eq("employee_id", employee.id)
              .order("created_at", { ascending: false })
              .limit(80),
            { data: [] }
          ),
          safeQuery(
            supabaseAdmin
              .from("workforce_events")
              .select("id, event_type, payload, created_at")
              .eq("org_id", orgId)
              .eq("employee_id", employee.id)
              .order("created_at", { ascending: false })
              .limit(80),
            { data: [] }
          ),
        ]);
        bundle.audit = mergeEmployeeTimeline(auditRes.data || [], eventRes.data || [], {
          canManagePayroll: canSeePay,
        });
      })()
    );
  }
  await Promise.all(jobs);
  return bundle;
}

export async function workforceSummary(orgId, { managerScopeId = null, includePendingInvites = false } = {}) {
  const listed = await listEmployees(orgId, {
    canManagePayroll: false,
    managerScopeId,
    includeLeaveStatus: true,
    pageAll: true,
  });
  const roster = listed.items;

  const now = johannesburgYmd();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ids = roster.map((row) => row.id).filter(Boolean);
  let leaveCounts = { pending: 0, approved: 0, rejected: 0, upcoming: 0, on_leave_today: 0 };
  let leaveRows = [];
  if (ids.length) {
    const leaveQuery = await supabaseAdmin
      .from("leave_requests")
      .select("id, status, start_date, end_date, employee_id")
      .eq("org_id", orgId)
      .in("employee_id", ids);
    leaveRows = leaveQuery.data || [];
    const today = now.iso;
    for (const row of leaveRows) {
      const status = String(row.status || "").toLowerCase();
      if (status === "pending") leaveCounts.pending += 1;
      if (status === "approved") {
        leaveCounts.approved += 1;
        if (row.start_date && row.start_date >= today) leaveCounts.upcoming += 1;
      }
      if (status === "rejected") leaveCounts.rejected += 1;
    }
    leaveCounts.on_leave_today = countEmployeesOnLeaveToday(leaveRows, today);
  }

  const { data: runs } = await supabaseAdmin
    .from("pay_runs")
    .select("id, status, period_start, period_end, period_label, finalized_at")
    .eq("org_id", orgId)
    .order("period_start", { ascending: false })
    .limit(12);
  const current = (runs || [])[0] || null;

  let payslipsGenerated = 0;
  let payslipCountQuery = supabaseAdmin.from("payslips").select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if (managerScopeId && ids.length) {
    payslipCountQuery = payslipCountQuery.in("membership_id", ids);
  }
  const payslipCount = await payslipCountQuery;
  if (payslipCount.error) {
    throwIfMissingWorkforceColumn(payslipCount.error, "membership_id");
  } else {
    payslipsGenerated = payslipCount.count || 0;
  }

  const adjustment = await loadOutstandingAdjustmentSignals(orgId);
  let pendingInvites = null;
  if (includePendingInvites) {
    const nowIso = new Date().toISOString();
    const inviteCount = await supabaseAdmin
      .from("company_invites")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .is("revoked_at", null)
      .gte("expires_at", nowIso);
    pendingInvites = inviteCount.error ? 0 : inviteCount.count || 0;
  }

  const incompletePayroll = roster.filter((row) =>
    (row.attention_reasons || []).includes("incomplete_pay_rate")
  ).length;

  return {
    workforce: {
      total: roster.length,
      active: roster.filter((row) => row.lifecycle_status === "active").length,
      inactive: roster.filter((row) => row.lifecycle_status === "inactive").length,
      new_employees: roster.filter((row) => row.created_at && row.created_at >= thirtyDaysAgo).length,
      pending_onboarding: roster.filter(
        (row) =>
          row.portal_status === PORTAL_STATUS.INVITATION_SENT || row.portal_status === "invited"
      ).length,
      pending_invites: pendingInvites,
      incomplete_profiles: roster.filter((row) => row.needs_attention).length,
      incomplete_payroll: incompletePayroll,
      needs_attention: roster.filter((row) => row.needs_attention).length,
      awaiting_reassignment: roster.filter((row) => row.manager_assignment === "inactive").length,
    },
    leave: leaveCounts,
    payroll: {
      current_period: current
        ? { label: current.period_label, start: current.period_start, end: current.period_end, status: current.status }
        : null,
      last_run_status: current?.status || null,
      payslips_generated: payslipsGenerated,
      draft: (runs || []).filter((r) => r.status === "draft").length,
      awaiting_review: (runs || []).filter((r) => r.status === "awaiting_approval" || r.status === "calculated").length,
      awaiting_approval: (runs || []).filter((r) => r.status === "awaiting_approval").length,
      finalized: (runs || []).filter((r) => r.finalized_at).length,
      needs_adjustment_run: adjustment.needs_adjustment_run,
      adjustment_signals: adjustment.signals,
    },
    facets: listed.facets,
  };
}
