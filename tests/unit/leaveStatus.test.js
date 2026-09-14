import { describe, expect, it } from "vitest";
import {
  countEmployeesOnLeaveToday,
  deriveEmployeeLeaveStatus,
  EMPLOYEE_LEAVE_STATUS,
} from "../../shared/workforce/leaveStatus.js";

describe("deriveEmployeeLeaveStatus", () => {
  it("prefers on leave today over pending and upcoming", () => {
    expect(
      deriveEmployeeLeaveStatus(
        [
          { status: "approved", start_date: "2026-09-10", end_date: "2026-09-20" },
          { status: "pending", start_date: "2026-10-01", end_date: "2026-10-02" },
        ],
        "2026-09-14"
      )
    ).toBe(EMPLOYEE_LEAVE_STATUS.ON_LEAVE);
  });

  it("uses pending when not currently on leave", () => {
    expect(
      deriveEmployeeLeaveStatus(
        [{ status: "pending", start_date: "2026-10-01", end_date: "2026-10-05" }],
        "2026-09-14"
      )
    ).toBe(EMPLOYEE_LEAVE_STATUS.PENDING);
  });

  it("uses upcoming for future approved leave", () => {
    expect(
      deriveEmployeeLeaveStatus(
        [{ status: "approved", start_date: "2026-09-20", end_date: "2026-09-24" }],
        "2026-09-14"
      )
    ).toBe(EMPLOYEE_LEAVE_STATUS.UPCOMING);
  });
});

describe("countEmployeesOnLeaveToday", () => {
  it("counts unique employees overlapping today", () => {
    expect(
      countEmployeesOnLeaveToday(
        [
          { employee_id: "a", status: "approved", start_date: "2026-09-13", end_date: "2026-09-15" },
          { employee_id: "a", status: "approved", start_date: "2026-09-14", end_date: "2026-09-14" },
          { employee_id: "b", status: "pending", start_date: "2026-09-14", end_date: "2026-09-14" },
          { employee_id: "c", status: "approved", start_date: "2026-09-20", end_date: "2026-09-21" },
        ],
        "2026-09-14"
      )
    ).toBe(1);
  });
});
