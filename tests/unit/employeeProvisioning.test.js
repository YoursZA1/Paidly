import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_ORG = "55555555-5555-4555-8555-555555555555";
const MEMBERSHIP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ANNUAL_TYPE_ID = "66666666-6666-4666-8666-666666666666";
const SICK_TYPE_ID = "77777777-7777-4777-8777-777777777777";

const { store, supabaseAdmin, insertPayrollProfileRow } = vi.hoisted(() => {
  const tables = {
    memberships: [],
    payroll_profiles: [],
    leave_types: [],
    leave_balances: [],
    attendance_profiles: [],
    workforce_notification_prefs: [],
    profiles: [],
  };
  const insertCounts = {
    payroll_profiles: 0,
    leave_balances: 0,
    attendance_profiles: 0,
    workforce_notification_prefs: 0,
  };

  function reset() {
    for (const key of Object.keys(tables)) tables[key] = [];
    for (const key of Object.keys(insertCounts)) insertCounts[key] = 0;
  }

  function matches(row, filters) {
    return filters.every(([field, value]) => String(row[field] ?? "") === String(value ?? ""));
  }

  async function exec(ctx, { single = false } = {}) {
    if (ctx.payload) {
      const row = { ...ctx.payload };
      if (!row.id && ctx.table !== "workforce_notification_prefs") {
        row.id = `${ctx.table}-${tables[ctx.table].length + 1}`;
      }
      tables[ctx.table].push(row);
      insertCounts[ctx.table] = (insertCounts[ctx.table] || 0) + 1;
      return { data: row, error: null };
    }
    const found = (tables[ctx.table] || []).filter((row) => matches(row, ctx.filters));
    if (single) return { data: found[0] || null, error: null };
    return { data: found, error: null };
  }

  const supabaseAdmin = {
    from(table) {
      const ctx = { table, filters: [], payload: null };
      const chain = {
        select() {
          return chain;
        },
        eq(field, value) {
          ctx.filters.push([field, value]);
          return chain;
        },
        insert(row) {
          ctx.payload = row;
          return chain;
        },
        maybeSingle() {
          return exec(ctx, { single: true });
        },
        then(onFulfilled, onRejected) {
          return exec(ctx).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };

  const insertPayrollProfileRow = vi.fn(async (row) => {
    const created = { id: "payroll-profile-1", ...row };
    tables.payroll_profiles.push(created);
    insertCounts.payroll_profiles += 1;
    return created;
  });

  return { store: { tables, insertCounts, reset }, supabaseAdmin, insertPayrollProfileRow };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin }));
vi.mock("../../server/src/payroll/payrollService.js", () => ({ insertPayrollProfileRow }));
vi.mock("../../server/src/leave/leaveService.js", () => ({
  ensureLeaveTypes: vi.fn(async () => undefined),
}));

import { provisionEmployeeWorkforce } from "../../server/src/workforce/employeeProvisioning.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function seedEmployee({ orgId = ORG_ID } = {}) {
  store.tables.memberships.push({
    id: MEMBERSHIP_ID,
    org_id: orgId,
    user_id: USER_ID,
    role: "employee",
    job_function: "general",
    employee_number: "EMP-002",
    department: "Ops",
    employment_status: "active",
    employment_start_date: "2026-01-01",
    invited_email: "thabo@example.com",
  });
  store.tables.leave_types.push(
    { id: ANNUAL_TYPE_ID, org_id: ORG_ID, days_per_year: 15, accrual_method: "monthly", active: true },
    { id: SICK_TYPE_ID, org_id: ORG_ID, days_per_year: 10, accrual_method: "front_loaded", active: true }
  );
}

describe("provisionEmployeeWorkforce (Phase 2 verify)", () => {
  beforeEach(() => {
    store.reset();
    insertPayrollProfileRow.mockClear();
  });

  it("creates payroll profile, leave balances, attendance, and notification prefs", async () => {
    seedEmployee();

    const result = await provisionEmployeeWorkforce(ORG_ID, MEMBERSHIP_ID);

    expect(result?.employee?.id).toBe(MEMBERSHIP_ID);
    expect(result?.payroll_profile?.id).toBe("payroll-profile-1");
    expect(result?.payroll_profile?.membership_id).toBe(MEMBERSHIP_ID);
    expect(result?.attendance_profile?.employee_id).toBe(MEMBERSHIP_ID);
    expect(store.insertCounts.payroll_profiles).toBe(1);
    expect(store.insertCounts.leave_balances).toBe(2);
    expect(store.insertCounts.attendance_profiles).toBe(1);
    expect(store.insertCounts.workforce_notification_prefs).toBe(1);
    expect(store.tables.leave_balances.map((row) => row.leave_type_id).sort()).toEqual(
      [ANNUAL_TYPE_ID, SICK_TYPE_ID].sort()
    );
    expect(store.tables.leave_balances.every((row) => row.employee_id === MEMBERSHIP_ID)).toBe(true);
    expect(store.tables.workforce_notification_prefs[0]).toMatchObject({
      employee_id: MEMBERSHIP_ID,
      org_id: ORG_ID,
    });
  });

  it("is safe to call twice — existing rows are reused, not duplicated", async () => {
    seedEmployee();

    const first = await provisionEmployeeWorkforce(ORG_ID, MEMBERSHIP_ID);
    const second = await provisionEmployeeWorkforce(ORG_ID, MEMBERSHIP_ID);

    expect(second?.payroll_profile?.id).toBe(first?.payroll_profile?.id);
    expect(second?.attendance_profile?.id).toBe(first?.attendance_profile?.id);
    expect(insertPayrollProfileRow).toHaveBeenCalledTimes(1);
    expect(store.insertCounts.payroll_profiles).toBe(1);
    expect(store.insertCounts.leave_balances).toBe(2);
    expect(store.insertCounts.attendance_profiles).toBe(1);
    expect(store.insertCounts.workforce_notification_prefs).toBe(1);
    expect(store.tables.payroll_profiles).toHaveLength(1);
    expect(store.tables.leave_balances).toHaveLength(2);
    expect(store.tables.attendance_profiles).toHaveLength(1);
    expect(store.tables.workforce_notification_prefs).toHaveLength(1);
  });

  it("does not provision when the membership is missing or belongs to another org", async () => {
    seedEmployee({ orgId: OTHER_ORG });

    expect(await provisionEmployeeWorkforce(ORG_ID, MEMBERSHIP_ID)).toBeNull();
    expect(await provisionEmployeeWorkforce(ORG_ID, "99999999-9999-4999-8999-999999999999")).toBeNull();
    expect(insertPayrollProfileRow).not.toHaveBeenCalled();
    expect(store.insertCounts.leave_balances).toBe(0);
    expect(store.insertCounts.attendance_profiles).toBe(0);
    expect(store.insertCounts.workforce_notification_prefs).toBe(0);
  });

  it("has unique keys so a raced second insert cannot create a second identity", () => {
    const payroll = readFileSync(
      join(root, "supabase/migrations/20260902120000_payroll_engine_and_leave_ledger.sql"),
      "utf8"
    );
    const attendance = readFileSync(
      join(root, "supabase/migrations/20260907200000_workforce_canonical_employee_identity.sql"),
      "utf8"
    );
    const prefs = readFileSync(
      join(root, "supabase/migrations/20260910140000_workforce_leave_tokens_and_prefs.sql"),
      "utf8"
    );
    const tighten = readFileSync(
      join(root, "supabase/migrations/20260910130000_workforce_integrity_tighten.sql"),
      "utf8"
    );

    expect(payroll).toMatch(/UNIQUE \(membership_id\)/);
    expect(payroll).toMatch(/UNIQUE \(payroll_profile_id, leave_type_id, leave_year\)/);
    expect(attendance).toMatch(/UNIQUE \(employee_id\)/);
    expect(prefs).toMatch(/employee_id uuid PRIMARY KEY/);
    expect(tighten).toMatch(/leave_balances_employee_type_year_uidx/);
  });
});
