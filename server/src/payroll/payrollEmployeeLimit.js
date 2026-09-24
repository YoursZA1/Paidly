/**
 * Package limit FAMILY_LIMITS.payslipEmployees (Starter 1, Business 4, Growth unlimited) for the
 * pay-run engine. Same rule as the database guard on standalone payslips (checkPayslipCapacity):
 * already-paid employees are grandfathered; only new employees beyond the limit are refused.
 * Plan comes from the company subscription (resolveEntitlementForCompany), like every other gate.
 */
import { supabaseAdmin } from "../supabaseAdmin.js";
import { entitlementsEnforceEnabled, resolveEntitlementForCompany } from "../billing/entitlements.js";
import { checkPayslipCapacity, lowestFamilyAllowing, payslipEmployeeKey } from "../../../shared/planFeatures.js";

export const PAYROLL_EMPLOYEE_LIMIT_CODE = "PAYROLL_EMPLOYEE_LIMIT";

const FAMILY_LABEL = Object.freeze({ starter: "Starter", business: "Business", growth: "Growth", enterprise: "Enterprise" });

/** Payroll profile / pay-run item → the identity a payslip for them would carry. */
export function payrollEmployeeKey(row) {
  return payslipEmployeeKey({
    membership_id: row?.membership_id,
    employee_id: row?.employee_number ?? row?.employee_id,
    employee_name: row?.full_name ?? row?.employee_name,
  });
}

/**
 * Capacity for a set of employees, without throwing (for the Payroll overview banner).
 * @param {string} orgId
 * @param {object[]} employees payroll profiles or pay-run items
 */
export async function payrollEmployeeCapacity(orgId, employees, opts = {}) {
  const supabase = opts.supabase || supabaseAdmin;
  const ent = await resolveEntitlementForCompany(supabase, orgId);
  const limit = ent?.access && ent.family ? ent.payslipEmployees ?? null : null;
  let issuedKeys = [];
  if (limit != null) {
    const { data, error } = await supabase
      .from("payslips")
      .select("membership_id, employee_id, employee_name")
      .eq("org_id", orgId);
    if (error) throw error;
    issuedKeys = (data || []).map(payslipEmployeeKey);
  }
  const result = checkPayslipCapacity({ limit, issuedKeys, requestedKeys: (employees || []).map(payrollEmployeeKey) });
  const blocked = (employees || []).filter((e) => result.newKeys.includes(payrollEmployeeKey(e)));
  return {
    ...result,
    plan: ent?.family || null,
    upgradeTo: result.ok ? null : lowestFamilyAllowing(ent?.family, "payslipEmployees", result.used + result.newKeys.length),
    blockedEmployees: result.ok ? [] : blocked.map((e) => e.full_name || e.employee_name || e.employee_number || "Employee"),
  };
}

/**
 * Throws 403 PAYROLL_EMPLOYEE_LIMIT when paying `employees` would add new employees beyond the limit.
 * @param {string} orgId
 * @param {object[]} employees payroll profiles or pay-run items
 */
export async function assertPayrollEmployeeCapacity(orgId, employees, opts = {}) {
  const cap = await payrollEmployeeCapacity(orgId, employees, opts);
  if (cap.ok) return;
  if (!entitlementsEnforceEnabled()) {
    console.warn("[entitlements] report-only would block payroll", { orgId, plan: cap.plan, limit: cap.limit, used: cap.used, new: cap.newKeys.length });
    return;
  }
  const planName = FAMILY_LABEL[cap.plan] || "current";
  const names = cap.blockedEmployees.slice(0, 5).join(", ");
  const err = new Error(
    `Your ${planName} plan includes payslips for ${cap.limit} employee${cap.limit === 1 ? "" : "s"}, and ${cap.used} already ${cap.used === 1 ? "has" : "have"} payslips. ` +
      `${names ? `Not yet paid: ${names}. ` : ""}` +
      `${cap.upgradeTo ? `Upgrade to ${FAMILY_LABEL[cap.upgradeTo]}, or t` : "T"}ake new employees off payroll on their Payroll tab.`
  );
  err.status = 403;
  err.code = PAYROLL_EMPLOYEE_LIMIT_CODE;
  err.details = { limit: cap.limit, used: cap.used, plan: cap.plan, upgradeTo: cap.upgradeTo, employees: cap.blockedEmployees };
  throw err;
}
