import { describe, expect, it } from "vitest";
import {
  outstandingAdjustmentSignals,
  payRunNeedsAdjustment,
  uncoveredPayRunIds,
} from "../../shared/payroll/adjustmentRun.js";

const ORIGINAL = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("adjustment run flags", () => {
  const signals = [
    {
      leave_request_id: "leave-1",
      pay_run_ids: [ORIGINAL],
    },
  ];

  it("keeps a signal outstanding until an adjustment run covers the finalized pay run", () => {
    expect(outstandingAdjustmentSignals(signals, [])).toHaveLength(1);
    expect(
      outstandingAdjustmentSignals(signals, [{ original_pay_run_id: OTHER, status: "draft" }])
    ).toHaveLength(1);
    expect(
      outstandingAdjustmentSignals(signals, [{ original_pay_run_id: ORIGINAL, status: "cancelled" }])
    ).toHaveLength(1);
    expect(
      outstandingAdjustmentSignals(signals, [{ original_pay_run_id: ORIGINAL, status: "draft" }])
    ).toHaveLength(0);
  });

  it("lists uncovered finalized run ids and matches a pay run page", () => {
    expect(uncoveredPayRunIds(signals)).toEqual([ORIGINAL]);
    expect(payRunNeedsAdjustment(ORIGINAL, signals)).toBe(true);
    expect(payRunNeedsAdjustment(OTHER, signals)).toBe(false);
  });
});
