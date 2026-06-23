import { describe, it, expect } from "vitest";
import {
  summarizeCountResult,
  assembleSelfWorkspaceSummary,
  assembleCompanyWorkspaceSummary,
  postgrestInList,
  NON_MEMBER_DOC_TYPES,
  LEAVE_DOCUMENT_TYPE,
  BUSINESS_DOCUMENT_TYPES,
} from "@/services/memberDashboardSummary";

describe("summarizeCountResult", () => {
  it("uses the exact count and exposes recent + latest", () => {
    const result = summarizeCountResult({
      data: [{ id: "a" }, { id: "b" }],
      count: 12,
    });
    expect(result.count).toBe(12);
    expect(result.recent).toHaveLength(2);
    expect(result.latest).toEqual({ id: "a" });
  });

  it("falls back to row length when count is missing", () => {
    expect(summarizeCountResult({ data: [{ id: "a" }] }).count).toBe(1);
  });

  it("caps recent at 5 rows", () => {
    const data = Array.from({ length: 9 }, (_, i) => ({ id: i }));
    expect(summarizeCountResult({ data, count: 9 }).recent).toHaveLength(5);
  });

  it("is null-safe", () => {
    const result = summarizeCountResult(undefined);
    expect(result).toEqual({ count: 0, recent: [], latest: null });
  });
});

describe("assembleSelfWorkspaceSummary", () => {
  it("shapes each bucket and carries the pending leave count", () => {
    const vm = assembleSelfWorkspaceSummary({
      payslips: { data: [{ id: "p1" }], count: 3 },
      leave: { data: [{ id: "l1" }], count: 4 },
      leavePending: 2,
      documents: { data: [], count: 7 },
    });
    expect(vm.payslips.count).toBe(3);
    expect(vm.leave.count).toBe(4);
    expect(vm.leave.pending).toBe(2);
    expect(vm.documents.count).toBe(7);
  });

  it("defaults pending to 0 and is null-safe", () => {
    const vm = assembleSelfWorkspaceSummary({});
    expect(vm.leave.pending).toBe(0);
    expect(vm.payslips.count).toBe(0);
    expect(vm.documents.count).toBe(0);
  });
});

describe("assembleCompanyWorkspaceSummary", () => {
  it("derives member count from the roster and passes counts through", () => {
    const vm = assembleCompanyWorkspaceSummary({
      members: [{ user_id: "1" }, { user_id: "2" }],
      pendingLeave: 5,
      payslips: 10,
      documents: 8,
    });
    expect(vm.members.count).toBe(2);
    expect(vm.members.roster).toHaveLength(2);
    expect(vm.pendingLeave).toBe(5);
    expect(vm.payslips).toBe(10);
    expect(vm.documents).toBe(8);
  });

  it("is null-safe with empty roster and zeroed counts", () => {
    const vm = assembleCompanyWorkspaceSummary({});
    expect(vm.members.count).toBe(0);
    expect(vm.pendingLeave).toBe(0);
  });
});

describe("document type buckets", () => {
  it("excludes finance docs and leave from the member documents bucket", () => {
    for (const t of BUSINESS_DOCUMENT_TYPES) expect(NON_MEMBER_DOC_TYPES).toContain(t);
    expect(NON_MEMBER_DOC_TYPES).toContain(LEAVE_DOCUMENT_TYPE);
  });

  it("builds a PostgREST in-list", () => {
    expect(postgrestInList(["a", "b", "c"])).toBe("(a,b,c)");
  });
});
