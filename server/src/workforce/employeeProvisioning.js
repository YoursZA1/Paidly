import { supabaseAdmin } from "../supabaseAdmin.js";
import { insertPayrollProfileRow } from "../payroll/payrollService.js";
import { ensureLeaveTypes } from "../leave/leaveService.js";
import { johannesburgYmd } from "../../../shared/payroll/dates.js";
import { notifyUser } from "../payroll/payrollGate.js";
import {
  registerWorkforceSubscriber,
  WORKFORCE_EVENT_TYPES,
} from "./workforceEvents.js";

async function loadEmployee(employeeId) {
  if (!employeeId) return null;
  const { data } = await supabaseAdmin
    .from("memberships")
    .select(
      "id, org_id, user_id, role, job_function, employee_number, department, employment_status, invited_email"
    )
    .eq("id", employeeId)
    .maybeSingle();
  return data;
}

async function writeAudit(event, action, afterState = {}) {
  try {
    await supabaseAdmin.from("workforce_audit_logs").insert({
      org_id: event.org_id,
      employee_id: event.employee_id,
      actor_id: event.actor_id || null,
      action,
      event_id: event.id,
      correlation_id: event.correlation_id || null,
      after_state: afterState,
    });
  } catch (err) {
    console.warn("[workforce] audit insert failed:", err?.message || err);
  }
}

async function ensurePayrollProfile(event, employee) {
  const { data: existing } = await supabaseAdmin
    .from("payroll_profiles")
    .select("id")
    .eq("membership_id", employee.id)
    .maybeSingle();
  if (existing?.id) return existing;

  const { data: person } = employee.user_id
    ? await supabaseAdmin
        .from("profiles")
        .select("full_name, first_name, last_name, email, job_title, department")
        .eq("id", employee.user_id)
        .maybeSingle()
    : { data: null };

  const name =
    person?.full_name ||
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.email ||
    employee.invited_email ||
    "Employee";

  return insertPayrollProfileRow({
    org_id: employee.org_id,
    membership_id: employee.id,
    user_id: employee.user_id || null,
    employee_number: employee.employee_number || null,
    full_name: name,
    email: person?.email || employee.invited_email || null,
    job_title: person?.job_title || null,
    department: employee.department || person?.department || null,
    employment_status: employee.employment_status || "active",
    payroll_status: "active",
    pay_frequency: "monthly",
    pay_type: "monthly_salary",
  });
}

async function ensureLeaveBalances(orgId, profile) {
  if (!profile?.id) return;
  await ensureLeaveTypes(orgId);
  const year = johannesburgYmd().year;
  const { data: types } = await supabaseAdmin
    .from("leave_types")
    .select("id, days_per_year")
    .eq("org_id", orgId)
    .eq("active", true);
  for (const leaveType of types || []) {
    const { data: existing } = await supabaseAdmin
      .from("leave_balances")
      .select("id")
      .eq("payroll_profile_id", profile.id)
      .eq("leave_type_id", leaveType.id)
      .eq("leave_year", year)
      .maybeSingle();
    if (existing?.id) continue;
    const entitled = Number(leaveType.days_per_year) || 0;
    const { error } = await supabaseAdmin.from("leave_balances").insert({
      org_id: orgId,
      payroll_profile_id: profile.id,
      leave_type_id: leaveType.id,
      leave_year: year,
      entitled,
      accrued: 0,
      used: 0,
      pending: 0,
    });
    if (error && !/duplicate|unique/i.test(error.message || "")) throw error;
  }
}

async function onEmployeeCreated(event) {
  const employee = await loadEmployee(event.employee_id);
  if (!employee) return;

  const profile = await ensurePayrollProfile(event, employee);
  await ensureLeaveBalances(employee.org_id, profile);
  await writeAudit(event, WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED, {
    membership_id: employee.id,
    payroll_profile_id: profile?.id || null,
  });
}

async function onPortalActivated(event) {
  const employee = await loadEmployee(event.employee_id);
  if (employee?.user_id) {
    await notifyUser(employee.user_id, "Your Paidly employee access is now active.");
  }
  await writeAudit(event, WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED, {
    membership_id: event.employee_id,
  });
}

let registered = false;

export function registerWorkforceSubscribers() {
  if (registered) return;
  registered = true;
  registerWorkforceSubscriber(WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED, onEmployeeCreated);
  registerWorkforceSubscriber(WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED, onPortalActivated);
}
