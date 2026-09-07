import { describe, expect, it } from "vitest";
import {
  firstQueryString,
  isUuid,
  looksLikeEmployeeDisplayLabel,
  parseUuid,
  requireUuid,
} from "../../shared/ids/uuid.js";
import { mapLeaveDbError, parseLeaveListFilters } from "../../shared/leave/leaveIds.js";
import {
  canonicalEmployeeId,
  employeeOptionValue,
  formatEmployeeLabel,
  payrollProfileIdOf,
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

  it("never treats a missing user_id as a reason to use the display label", () => {
    expect(employeeOptionValue({ ...employee, user_id: null })).toBe(EMPLOYEE_UUID);
    expect(employeeOptionValue({ id: DISPLAY, full_name: "Armando Mavelele", employee_number: "EMP-002" })).toBe("");
    expect(employeeOptionValue({ id: null, full_name: "Armando Mavelele", employee_number: "EMP-002" })).toBe("");
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
    });
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
