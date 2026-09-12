import { describe, expect, it } from "vitest";
import {
  isMissingWorkforceColumn,
  throwIfMissingWorkforceColumn,
} from "../../server/src/workforce/schemaGuard.js";

describe("workforce schema guard", () => {
  it("detects a missing membership_id column and refuses to retry", () => {
    const error = { message: "column payslips.membership_id does not exist" };
    expect(isMissingWorkforceColumn(error, "membership_id")).toBe(true);
    expect(() => throwIfMissingWorkforceColumn(error, "membership_id")).toThrow(
      /Apply the latest workforce migrations/
    );
  });

  it("detects missing pay-run snapshot columns", () => {
    const error = { message: 'column "base_salary_snapshot" of relation "pay_run_items" does not exist' };
    expect(
      isMissingWorkforceColumn(error, ["base_salary_snapshot", "unpaid_leave_days", "unpaid_leave_amount"])
    ).toBe(true);
    expect(() =>
      throwIfMissingWorkforceColumn(error, ["base_salary_snapshot", "unpaid_leave_days"])
    ).toThrow(/base_salary_snapshot/);
  });

  it("leaves unrelated errors to the caller", () => {
    const error = { message: "duplicate key value violates unique constraint" };
    expect(isMissingWorkforceColumn(error, "membership_id")).toBe(false);
    expect(() => throwIfMissingWorkforceColumn(error, "membership_id")).not.toThrow();
  });
});
