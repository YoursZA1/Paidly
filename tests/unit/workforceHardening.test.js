import { describe, expect, it } from "vitest";
import { addDaysIso } from "../../shared/payroll/dates.js";
import {
  assertAppendOnlyStatutoryPayload,
  statutoryVersionRow,
  supersedeEffectiveTo,
} from "../../shared/payroll/statutoryVersion.js";
import { leaveRowsByProfile, mapPayRunLockResult, isMissingLockRpc, shouldRetryCalculateWithoutReclaim, restoreStatusAfterFailedCalculate } from "../../shared/payroll/payRunLock.js";
import {
  groupPayslipAccessEvents,
  isPayslipAccessAnomaly,
  PAYSLIP_OPENED_ANOMALY_THRESHOLD,
} from "../../shared/payroll/payslipAccessAnomaly.js";

describe("statutory versions", () => {
  it("rejects in-place edits by id", () => {
    expect(() => assertAppendOnlyStatutoryPayload({ id: "abc" })).toThrow(/cannot be edited in place/i);
  });

  it("closes the previous open window the day before the new version", () => {
    expect(
      supersedeEffectiveTo({ effective_from: "2026-01-01", effective_to: null }, "2026-09-01")
    ).toBe("2026-08-31");
    expect(
      supersedeEffectiveTo({ effective_from: "2026-01-01", effective_to: "2026-06-30" }, "2026-09-01")
    ).toBe(null);
  });

  it("builds an insert row without an id", () => {
    const row = statutoryVersionRow("org-1", {
      code: "uif",
      name: "UIF",
      effective_from: "2026-09-01",
      calculation_type: "capped_percent",
      value: { rate: 0.01 },
    });
    expect(row.org_id).toBe("org-1");
    expect(row.code).toBe("UIF");
    expect(row.id).toBeUndefined();
  });
});

describe("pay-run lock helpers", () => {
  it("parses jsonb leave rows from the claim RPC", () => {
    const map = leaveRowsByProfile('[{"payroll_profile_id":"p1","id":"a"}]');
    expect(map.get("p1")).toHaveLength(1);
  });

  it("groups leave rows by payroll profile", () => {
    const map = leaveRowsByProfile([
      { payroll_profile_id: "p1", id: "a" },
      { payroll_profile_id: "p1", id: "b" },
      { payroll_profile_id: "p2", id: "c" },
    ]);
    expect(map.get("p1")).toHaveLength(2);
    expect(map.get("p2")).toHaveLength(1);
    const fromJson = leaveRowsByProfile(
      JSON.stringify([{ payroll_profile_id: "p1", id: "a" }])
    );
    expect(fromJson.get("p1")).toHaveLength(1);
  });

  it("maps busy and leave-changed RPC results to 409", () => {
    expect(() => mapPayRunLockResult({ ok: false, code: "PAY_RUN_BUSY" })).toThrow(/already calculating/i);
    try {
      mapPayRunLockResult({ ok: false, code: "LEAVE_CHANGED", leave_fingerprint: "abc" });
    } catch (err) {
      expect(err.code).toBe("LEAVE_CHANGED");
      expect(err.status).toBe(409);
      expect(err.leaveFingerprint).toBe("abc");
    }
  });

  it("does not treat a successful lock payload as an error", () => {
    expect(mapPayRunLockResult({ ok: true, leave_fingerprint: "fp", leave_rows: [] })).toEqual({
      ok: true,
      leave_fingerprint: "fp",
      leave_rows: [],
    });
  });

  it("retries leave-changed without a second claim", () => {
    expect(shouldRetryCalculateWithoutReclaim({ code: "LEAVE_CHANGED" }, 0)).toBe(true);
    expect(shouldRetryCalculateWithoutReclaim({ code: "LEAVE_CHANGED" }, 1)).toBe(false);
    expect(shouldRetryCalculateWithoutReclaim({ code: "PAY_RUN_BUSY" }, 0)).toBe(false);
  });

  it("restores the pre-claim status if calculate fails after processing", () => {
    expect(restoreStatusAfterFailedCalculate("draft", null)).toBe("draft");
    expect(restoreStatusAfterFailedCalculate("calculated", "2026-09-01T00:00:00Z")).toBe("calculated");
    expect(restoreStatusAfterFailedCalculate("processing", "2026-09-01T00:00:00Z")).toBe("calculated");
    expect(restoreStatusAfterFailedCalculate("processing", null)).toBe("draft");
  });

  it("detects a missing RPC so calculate can fall back", () => {
    expect(isMissingLockRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingLockRpc({ message: "function public.claim_pay_run_for_calculate does not exist" })).toBe(true);
  });
});

describe("payslip public access anomaly", () => {
  it("flags a burst of opens or downloads", () => {
    const events = Array.from({ length: PAYSLIP_OPENED_ANOMALY_THRESHOLD }, () => ({
      org_id: "org",
      source_id: "slip",
      event_type: "opened",
    }));
    const grouped = groupPayslipAccessEvents(events);
    expect(isPayslipAccessAnomaly(grouped[0])).toBe(true);
    expect(isPayslipAccessAnomaly({ opened: 1, downloaded: 0 })).toBe(false);
    expect(isPayslipAccessAnomaly({ opened: 0, downloaded: 3 })).toBe(true);
  });
});

describe("addDaysIso", () => {
  it("steps across month boundaries", () => {
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });
});
