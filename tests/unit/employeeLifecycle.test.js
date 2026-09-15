import { describe, expect, it } from "vitest";
import {
  attentionReasonLabel,
  eligibleManagersFromRoster,
  employeeAttentionReasons,
  isEligibleWorkforceManager,
  isPayrollParticipationActive,
  isWorkforceEmployeeActive,
  managerAssignmentState,
  normalizeEmploymentLifecycleAction,
  workforceLifecycleLabel,
} from "../../shared/workforce/employeeLifecycle.js";
import { canDecideLeave } from "../../server/src/leave/leaveAuthz.js";

describe("employee lifecycle", () => {
  it("treats disabled_at and inactive/terminated/suspended as inactive", () => {
    expect(isWorkforceEmployeeActive({ employment_status: "active" })).toBe(true);
    expect(isWorkforceEmployeeActive({ employment_status: "on_leave" })).toBe(true);
    expect(isWorkforceEmployeeActive({ employment_status: "inactive" })).toBe(false);
    expect(isWorkforceEmployeeActive({ employment_status: "terminated" })).toBe(false);
    expect(isWorkforceEmployeeActive({ employment_status: "active", disabled_at: "2026-01-01" })).toBe(false);
    expect(workforceLifecycleLabel({ employment_status: "terminated" })).toBe("Inactive");
  });

  it("only allows active manager/admin/hr to receive new reports", () => {
    const mgr = { id: "m1", role: "manager", employment_status: "active" };
    const inactive = { id: "m2", role: "manager", employment_status: "inactive" };
    const employee = { id: "e1", role: "employee", employment_status: "active" };
    expect(isEligibleWorkforceManager(mgr)).toBe(true);
    expect(isEligibleWorkforceManager(inactive)).toBe(false);
    expect(isEligibleWorkforceManager(employee)).toBe(false);
    expect(isEligibleWorkforceManager(mgr, { excludeId: "m1" })).toBe(false);
    expect(eligibleManagersFromRoster([mgr, inactive, employee]).map((row) => row.id)).toEqual(["m1"]);
  });

  it("flags inactive managers and missing HR fields", () => {
    const row = {
      employment_status: "active",
      manager_membership_id: "m1",
      manager_active: false,
      department: "",
      payroll_status: "unprovisioned",
    };
    expect(managerAssignmentState(row)).toBe("inactive");
    expect(employeeAttentionReasons(row)).toEqual(
      expect.arrayContaining(["inactive_manager", "missing_department", "missing_payroll"])
    );
    expect(attentionReasonLabel("inactive_manager")).toMatch(/reassignment required/i);
  });

  it("flags a provisioned payroll profile with a zero salary as incomplete, not missing", () => {
    const row = {
      employment_status: "active",
      manager_membership_id: "m1",
      manager_active: true,
      department: "Ops",
      employment_start_date: "2026-01-01",
      payroll_status: "active",
      pay_type: "monthly_salary",
      base_salary: 0,
    };
    expect(employeeAttentionReasons(row)).toEqual(["incomplete_pay_rate"]);
    expect(attentionReasonLabel("incomplete_pay_rate")).toMatch(/zero/i);
  });

  it("keeps inactive employees out of new payroll participation", () => {
    expect(isPayrollParticipationActive({ payroll_status: "active", employment_status: "active" })).toBe(true);
    expect(isPayrollParticipationActive({ payroll_status: "active", employment_status: "inactive" })).toBe(false);
    expect(isPayrollParticipationActive({ payroll_status: "paused", employment_status: "active" })).toBe(false);
  });

  it("maps activate/deactivate actions from status aliases", () => {
    expect(normalizeEmploymentLifecycleAction({ action: "deactivate" })).toBe("deactivate");
    expect(normalizeEmploymentLifecycleAction({ employment_status: "terminated" })).toBe("deactivate");
    expect(normalizeEmploymentLifecycleAction({ employment_status: "active" })).toBe("activate");
    expect(normalizeEmploymentLifecycleAction({ employment_status: "on_leave" })).toBe(null);
  });
});

describe("inactive managers cannot approve leave", () => {
  const employee = { id: "emp-1", manager_membership_id: "mgr-1" };

  it("blocks an inactive assigned manager", () => {
    const manager = {
      id: "mgr-1",
      companyRole: "manager",
      jobFunction: "general",
      employment_status: "inactive",
    };
    const gate = canDecideLeave(manager, employee);
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("MANAGER_INACTIVE");
  });

  it("still lets active HR override", () => {
    const hr = {
      id: "hr-1",
      companyRole: "manager",
      jobFunction: "hr",
      employment_status: "active",
    };
    expect(canDecideLeave(hr, employee).ok).toBe(true);
  });
});
