import { describe, expect, it } from "vitest";
import {
  firstQueryString,
  isUuid,
  looksLikeEmployeeDisplayLabel,
  parseUuid,
  requireUuid,
} from "../../shared/ids/uuid.js";
import { assertLeaveRowEmployeeId, leaveRequestEmployeeScope, mapLeaveDbError, parseLeaveListFilters, scopedLeaveListFilters, intersectEmployeeIdLists } from "../../shared/leave/leaveIds.js";
import {
  canonicalEmployeeId,
  employeeOptionValue,
  formatEmployeeLabel,
  isPayslipIdentityRow,
  payrollProfileIdOf,
  printedEmployeeNumber,
} from "../../shared/workforce/employeeIdentity.js";

const EMPLOYEE_UUID = "11111111-1111-4111-8111-111111111111";
const PROFILE_UUID = "22222222-2222-4222-8222-222222222222";
const DISPLAY = "Armando Mavelele (EMP-002)";

describe("UUID guards", () => {
  it("accepts canonical UUIDs and rejects display labels", () => {
    expect(parseUuid(EMPLOYEE_UUID)).toBe(EMPLOYEE_UUID);
    expect(isUuid(EMPLOYEE_UUID)).toBe(true);
    expect(parseUuid(DISPLAY)).toBeNull();
    expect(parseUuid("EMP-002")).toBeNull();
    expect(parseUuid("")).toBeNull();
    expect(parseUuid(null)).toBeNull();
    expect(looksLikeEmployeeDisplayLabel(DISPLAY)).toBe(true);
    expect(looksLikeEmployeeDisplayLabel("EMP-002")).toBe(true);
    expect(looksLikeEmployeeDisplayLabel(EMPLOYEE_UUID)).toBe(false);
  });

  it("reads the first query scalar from arrays", () => {
    expect(firstQueryString([DISPLAY, EMPLOYEE_UUID])).toBe(DISPLAY);
    expect(parseUuid([EMPLOYEE_UUID])).toBe(EMPLOYEE_UUID);
    expect(parseUuid([DISPLAY])).toBeNull();
  });

  it("throws a 400 when a UUID field receives a display label", () => {
    try {
      requireUuid(DISPLAY, "employee id");
      throw new Error("expected requireUuid to throw");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(String(err.message)).toMatch(/UUID/i);
      expect(String(err.message)).not.toMatch(/invalid input syntax/i);
    }
  });
});

describe("employee identity", () => {
  const employee = {
    id: EMPLOYEE_UUID,
    employee_id: EMPLOYEE_UUID,
    membership_id: EMPLOYEE_UUID,
    payroll_profile_id: PROFILE_UUID,
    user_id: null,
    full_name: "Armando Mavelele",
    employee_number: "EMP-002",
  };

  it("uses memberships.id as the option value and name + number as the label", () => {
    expect(canonicalEmployeeId(employee)).toBe(EMPLOYEE_UUID);
    expect(employeeOptionValue(employee)).toBe(EMPLOYEE_UUID);
    expect(employeeOptionValue(employee)).not.toBe(PROFILE_UUID);
    expect(payrollProfileIdOf(employee)).toBe(PROFILE_UUID);
    expect(formatEmployeeLabel(employee)).toBe(DISPLAY);
  });

  it("never uses the printed employee number as the selector value", () => {
    expect(canonicalEmployeeId({ id: EMPLOYEE_UUID, employee_id: "EMP-002" })).toBe(EMPLOYEE_UUID);
    expect(employeeOptionValue({ employee_id: "EMP-002", employee_number: "EMP-002", full_name: "Armando Mavelele" })).toBe("");
    expect(employeeOptionValue({ membership_id: EMPLOYEE_UUID, employee_id: "EMP-002" })).toBe(EMPLOYEE_UUID);
  });

  it("never treats a missing user_id as a reason to use the display label", () => {
    expect(employeeOptionValue({ ...employee, user_id: null })).toBe(EMPLOYEE_UUID);
    expect(employeeOptionValue({ id: DISPLAY, full_name: "Armando Mavelele", employee_number: "EMP-002" })).toBe("");
    expect(employeeOptionValue({ id: null, full_name: "Armando Mavelele", employee_number: "EMP-002" })).toBe("");
  });

  it("prefers membership_id and never persists a payslip document id as the employee", () => {
    const leftoverUuid = "55555555-5555-4555-8555-555555555555";
    const payslipId = "66666666-6666-4666-8666-666666666666";
    expect(
      canonicalEmployeeId({
        id: payslipId,
        employee_id: leftoverUuid,
        membership_id: EMPLOYEE_UUID,
        payslip_number: "PS-2026-001",
        pay_period_start: "2026-09-01",
      })
    ).toBe(EMPLOYEE_UUID);
    expect(
      canonicalEmployeeId({
        id: payslipId,
        employee_id: "EMP-002",
        pay_period_start: "2026-09-01",
        pay_period_end: "2026-09-30",
      })
    ).toBeNull();
    expect(isPayslipIdentityRow({ payslip_number: "PS-1" })).toBe(true);
    expect(printedEmployeeNumber({ employee_id: leftoverUuid, employee_number: "EMP-002" })).toBe("EMP-002");
    expect(printedEmployeeNumber({ employee_id: DISPLAY })).toBe("EMP-002");
  });
});

describe("leave list filters", () => {
  it("drops display-name employee filters so Postgres never sees them", () => {
    expect(
      parseLeaveListFilters({
        status: "pending",
        employee_id: DISPLAY,
        user_id: DISPLAY,
        payroll_profile_id: DISPLAY,
        leave_type_id: "annual",
        department: "Ops",
      })
    ).toEqual({
      status: "pending",
      employee_id: undefined,
      payroll_profile_id: undefined,
      user_id: undefined,
      leave_type_id: undefined,
      department: "Ops",
      manager_id: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("drops teammate filters for employees without team leave access", () => {
    const filters = parseLeaveListFilters({
      status: "pending",
      employee_id: EMPLOYEE_UUID,
      user_id: EMPLOYEE_UUID,
    });
    expect(scopedLeaveListFilters(filters, false)).toEqual({
      status: "pending",
      employee_id: undefined,
      payroll_profile_id: undefined,
      user_id: undefined,
      leave_type_id: undefined,
      department: undefined,
      manager_id: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("keeps valid employee_id and leave_type_id UUIDs", () => {
    const typeId = "33333333-3333-4333-8333-333333333333";
    expect(
      parseLeaveListFilters({
        status: "approved",
        employee_id: EMPLOYEE_UUID,
        leave_type_id: typeId,
      })
    ).toEqual({
      status: "approved",
      employee_id: EMPLOYEE_UUID,
      payroll_profile_id: undefined,
      user_id: undefined,
      leave_type_id: typeId,
      department: undefined,
      manager_id: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("keeps manager and overlapping date filters", () => {
    const managerId = "44444444-4444-4444-8444-444444444444";
    expect(
      parseLeaveListFilters({
        manager_id: managerId,
        from: "2026-09-01",
        to: "2026-09-30",
      })
    ).toMatchObject({
      manager_id: managerId,
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(parseLeaveListFilters({ from: "not-a-date", to: "2026/09/01" })).toMatchObject({
      from: undefined,
      to: undefined,
    });
    expect(scopedLeaveListFilters({ manager_id: managerId, status: "pending" }, false).manager_id).toBeUndefined();
  });

  it("intersects employee id scopes", () => {
    expect(intersectEmployeeIdLists(null, null)).toBeNull();
    expect(intersectEmployeeIdLists(["a", "b"], null)).toEqual(["a", "b"]);
    expect(intersectEmployeeIdLists(null, ["b"])).toEqual(["b"]);
    expect(intersectEmployeeIdLists(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });

  it("prefers employee_id (memberships.id) over payroll_profile_id", () => {
    expect(
      leaveRequestEmployeeScope({
        employeeId: EMPLOYEE_UUID,
        profileId: null,
      })
    ).toEqual({ column: "employee_id", value: EMPLOYEE_UUID });
    expect(
      leaveRequestEmployeeScope({
        employeeId: EMPLOYEE_UUID,
        profileId: PROFILE_UUID,
      })
    ).toEqual({ column: "employee_id", value: EMPLOYEE_UUID });
    expect(
      leaveRequestEmployeeScope({
        employeeId: null,
        profileId: PROFILE_UUID,
      })
    ).toEqual({ column: "payroll_profile_id", value: PROFILE_UUID });
    expect(
      leaveRequestEmployeeScope({
        employeeId: null,
        profileId: null,
        userId: EMPLOYEE_UUID,
      })
    ).toEqual({ column: "user_id", value: EMPLOYEE_UUID });
    expect(leaveRequestEmployeeScope({ employeeId: DISPLAY, profileId: null })).toBeNull();
  });

  it("refuses leave writes without a membership UUID", () => {
    expect(assertLeaveRowEmployeeId({ employee_id: EMPLOYEE_UUID }, "leave_transactions")).toEqual({
      employee_id: EMPLOYEE_UUID,
    });
    try {
      assertLeaveRowEmployeeId({ employee_id: DISPLAY }, "leave_transactions");
      throw new Error("expected assertLeaveRowEmployeeId to throw");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(String(err.message)).toMatch(/employee_id/i);
    }
    try {
      assertLeaveRowEmployeeId({ payroll_profile_id: PROFILE_UUID }, "leave_balances");
      throw new Error("expected assertLeaveRowEmployeeId to throw");
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it("maps Postgres UUID syntax errors to a safe 400", () => {
    const mapped = mapLeaveDbError({
      message: `invalid input syntax for type uuid: "${DISPLAY}"`,
    });
    expect(mapped.status).toBe(400);
    expect(mapped.message).toMatch(/UUID/i);
    expect(mapped.message).not.toMatch(/invalid input syntax/i);
  });
});
