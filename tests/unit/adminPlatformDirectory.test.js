import { describe, expect, it } from "vitest";
import {
  healthStatus,
  isIntegerBindError,
  normalizeAdminPeriod,
  percentChange,
  resolveDirectoryLimit,
  resolvePeriodWindow,
  sumField,
} from "../../shared/admin/adminPlatformDirectory.js";
import {
  CUSTOMER_MONEY_UNAVAILABLE_REASON,
  adoptionRate,
  planFamilyLabel,
  successRate,
} from "../../shared/admin/adminPlatformMetrics.js";
import { getAdminNavGroupsForRole, flattenAdminNavItems } from "../../src/lib/adminNavConfig.js";

describe("admin platform directory helpers", () => {
  it("normalizes unknown periods to monthly", () => {
    expect(normalizeAdminPeriod("nope")).toBe("monthly");
    expect(normalizeAdminPeriod("weekly")).toBe("weekly");
  });

  it("computes percent change without inventing a value from zero", () => {
    expect(percentChange(20, 10)).toBe(100);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });

  it("resolves a monthly comparison window in UTC", () => {
    const now = new Date(Date.UTC(2026, 8, 8, 12));
    const window = resolvePeriodWindow("monthly", now);
    expect(window.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(window.prevFrom.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(window.compareLabel).toBe("vs last month");
  });

  it("sums money fields", () => {
    expect(sumField([{ amount: 10.125 }, { amount: 2 }], "amount")).toBe(12.13);
  });

  it("rejects a decimal LIMIT instead of truncating it", () => {
    expect(resolveDirectoryLimit(1.25)).toEqual({ ok: false, value: 1.25 });
    expect(resolveDirectoryLimit("1.25")).toEqual({ ok: false, value: 1.25 });
    expect(resolveDirectoryLimit(80)).toEqual({ ok: true, value: 80 });
    expect(resolveDirectoryLimit(undefined)).toEqual({ ok: true, value: 50 });
    expect(isIntegerBindError({ message: 'invalid input syntax for type integer: "1.25"' })).toBe(true);
  });

  it("does not emit 1.25 from one-decimal percent helpers", () => {
    expect(percentChange(101.25, 100)).toBe(1.3);
    expect(Number.isInteger(percentChange(101.25, 100) * 10)).toBe(true);
  });

  it("maps health from attention and critical counts", () => {
    expect(healthStatus({ critical: 0, attention: 0 })).toBe("healthy");
    expect(healthStatus({ critical: 0, attention: 2 })).toBe("attention");
    expect(healthStatus({ critical: 1, attention: 0 })).toBe("critical");
  });
});

describe("admin platform metric contract", () => {
  it("computes adoption without inventing a rate from zero", () => {
    expect(adoptionRate(18, 100)).toBe(18);
    expect(adoptionRate(0, 0)).toBeNull();
    expect(successRate(8, 10)).toBe(80);
  });

  it("maps legacy plan names onto the current family", () => {
    expect(planFamilyLabel("individual")).toBe("starter");
    expect(planFamilyLabel("sme")).toBe("business");
    expect(planFamilyLabel("corporate")).toBe("growth");
    expect(planFamilyLabel("starter_monthly")).toBe("starter");
  });

  it("refuses to treat customer books as Paidly revenue", () => {
    expect(CUSTOMER_MONEY_UNAVAILABLE_REASON).toMatch(/payment_history/);
    expect(CUSTOMER_MONEY_UNAVAILABLE_REASON).toMatch(/not Paidly revenue/);
  });
});

describe("admin nav groups", () => {
  it("hides billing and privileged items from support", () => {
    const paths = flattenAdminNavItems(getAdminNavGroupsForRole("support")).map((i) => i.path);
    expect(paths).toContain("/admin-v2");
    expect(paths).toContain("/admin-v2/users");
    expect(paths).not.toContain("/admin-v2/subscriptions");
    expect(paths).not.toContain("/admin-v2/settings");
    expect(paths).not.toContain("/admin-v2/audit-log");
    expect(paths).not.toContain("/admin-v2/reports/platform");
  });

  it("keeps sales on subscriptions but not settings", () => {
    const paths = flattenAdminNavItems(getAdminNavGroupsForRole("sales")).map((i) => i.path);
    expect(paths).toContain("/admin-v2/subscriptions");
    expect(paths).toContain("/admin-v2/revenue");
    expect(paths).not.toContain("/admin-v2/settings");
  });
});
