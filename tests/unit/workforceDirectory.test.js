import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filterWorkforceDirectory, sortWorkforceDirectory } from "@/lib/workforceDirectory.js";
import { buildCompanyAccessContext, canSeeOrgWorkforce, canViewEmployeeProfile } from "@/lib/companyPermissions.js";

const own = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

describe("filterWorkforceDirectory", () => {
  const rows = [
    {
      id: own,
      label: "Thabo Mavelele (EMP-002)",
      full_name: "Thabo Mavelele",
      employee_number: "EMP-002",
      job_title: "Cashier",
      department: "Ops",
      employment_status: "active",
      manager_membership_id: "mgr-1",
      leave_status: "on_leave",
      employment_start_date: "2026-01-01",
    },
    {
      id: other,
      label: "Amina Sale (EMP-003)",
      full_name: "Amina Sale",
      employee_number: "EMP-003",
      job_title: "Bookkeeper",
      department: "Finance",
      employment_status: "terminated",
      manager_membership_id: "mgr-2",
      leave_status: "none",
      employment_start_date: "2025-06-01",
    },
  ];

  it("filters by search, department, status, manager, job title, and leave status", () => {
    expect(filterWorkforceDirectory(rows, { search: "thabo" }).map((row) => row.id)).toEqual([own]);
    expect(filterWorkforceDirectory(rows, { department: "Finance" }).map((row) => row.id)).toEqual([other]);
    expect(filterWorkforceDirectory(rows, { status: "active" }).map((row) => row.id)).toEqual([own]);
    expect(filterWorkforceDirectory(rows, { status: "inactive" }).map((row) => row.id)).toEqual([other]);
    expect(filterWorkforceDirectory(rows, { status: "inactive" }).map((row) => row.id)).toEqual([other]);
    expect(filterWorkforceDirectory(rows, { managerId: "mgr-2" }).map((row) => row.id)).toEqual([other]);
    expect(filterWorkforceDirectory(rows, { jobTitle: "Cashier" }).map((row) => row.id)).toEqual([own]);
    expect(filterWorkforceDirectory(rows, { leaveStatus: "on_leave" }).map((row) => row.id)).toEqual([own]);
  });

  it("sorts by name and start date", () => {
    expect(sortWorkforceDirectory(rows, "name").map((row) => row.id)).toEqual([other, own]);
    expect(sortWorkforceDirectory(rows, "start").map((row) => row.id)).toEqual([other, own]);
  });
});

describe("org-wide workforce vs line manager profile scope", () => {
  it("treats HR and finance as org-wide, line managers as direct reports only", () => {
    const line = buildCompanyAccessContext({
      userId: "u1",
      companyId: "o1",
      membershipId: own,
      companyRole: "manager",
      jobFunction: "general",
    });
    const hr = buildCompanyAccessContext({
      userId: "u1",
      companyId: "o1",
      membershipId: own,
      companyRole: "manager",
      jobFunction: "hr",
    });
    const finance = buildCompanyAccessContext({
      userId: "u1",
      companyId: "o1",
      membershipId: own,
      companyRole: "manager",
      jobFunction: "finance",
    });
    expect(canSeeOrgWorkforce(line)).toBe(false);
    expect(canSeeOrgWorkforce(hr)).toBe(true);
    expect(canSeeOrgWorkforce(finance)).toBe(true);
    expect(canViewEmployeeProfile(line, other)).toBe(false);
    expect(canViewEmployeeProfile(hr, other)).toBe(true);
  });
});

describe("memberships manager select migration", () => {
  it("does not drop or truncate memberships and keeps payslip RLS on can_read_payslip_row", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260914120000_memberships_manager_select_direct_reports.sql", import.meta.url),
      "utf8"
    );
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE TABLE/i);
    expect(sql).toContain("can_see_org_workforce");
    expect(sql).toContain("manager_membership_id");
    expect(sql).toContain("20260912140000_payslip_compensation_rls.sql");
    const payslipRls = readFileSync(
      new URL("../../supabase/migrations/20260912140000_payslip_compensation_rls.sql", import.meta.url),
      "utf8"
    );
    expect(payslipRls).toContain("can_read_payslip_row");
    expect(payslipRls).toContain("can_manage_org_payroll");
    expect(payslipRls).not.toMatch(/DROP TABLE|TRUNCATE TABLE/i);
  });
});
