import { describe, expect, it } from "vitest";
import {
  healthStatus,
  normalizeAdminPeriod,
  percentChange,
  resolvePeriodWindow,
  sumField,
} from "../../shared/admin/adminPlatformDirectory.js";
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

  it("maps health from attention and critical counts", () => {
    expect(healthStatus({ critical: 0, attention: 0 })).toBe("healthy");
    expect(healthStatus({ critical: 0, attention: 2 })).toBe("attention");
    expect(healthStatus({ critical: 1, attention: 0 })).toBe("critical");
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
  });

  it("keeps sales on subscriptions but not settings", () => {
    const paths = flattenAdminNavItems(getAdminNavGroupsForRole("sales")).map((i) => i.path);
    expect(paths).toContain("/admin-v2/subscriptions");
    expect(paths).toContain("/admin-v2/revenue");
    expect(paths).not.toContain("/admin-v2/settings");
  });
});
