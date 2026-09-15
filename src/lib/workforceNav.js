import {
  BarChart2,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  FileText,
  Receipt,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { createPageUrl } from "@/utils";
import { PERMISSIONS } from "@/lib/companyPermissions";
import { WORKFORCE_EXPERIENCES } from "@/lib/workforceExperience.js";
import { employeeProfilePath } from "@/services/WorkforceApiService";

export const WORKFORCE_NAV_ID = "nav-workforce";

export function isWorkforceChildActive(childUrl, pathname, search) {
  const [path, query] = String(childUrl || "").split("?");
  const childTab = new URLSearchParams(query || "").get("tab");
  const locTab = new URLSearchParams(search || "").get("tab");
  if (childTab) return pathname === path && (locTab || "overview") === childTab;
  if (pathname === path) return true;
  if (path !== "/" && pathname.startsWith(`${path}/`)) return true;
  return false;
}

export function isWorkforceSectionPath(pathname) {
  const p = String(pathname || "").toLowerCase();
  return (
    p.startsWith("/workforce") ||
    p.startsWith("/employees") ||
    p.startsWith("/payroll") ||
    p.startsWith("/payrun") ||
    p === "/leave" ||
    p.startsWith("/leave/") ||
    p.startsWith("/leavecalendar") ||
    p.startsWith("/payslips") ||
    p.startsWith("/mypayroll") ||
    p.startsWith("/createleaverequest")
  );
}

function item(id, title, url, icon) {
  return { id, title, url, icon };
}

function employeeChildren({ membershipId }) {
  const children = [
    item("nav-workforce-overview", "Home", createPageUrl("Workforce"), ClipboardList),
    item("nav-workforce-leave", "My leave", `${createPageUrl("MyPayroll")}?tab=leave`, CalendarOff),
    item("nav-workforce-payslips", "My payslips", `${createPageUrl("MyPayroll")}?tab=payslips`, Receipt),
  ];
  if (membershipId) {
    children.push(item("nav-workforce-profile", "My profile", employeeProfilePath(membershipId), User));
  }
  return children;
}

function managerChildren() {
  const base = createPageUrl("Workforce/manager");
  return [
    item("nav-workforce-overview", "Overview", `${base}?tab=overview`, ClipboardList),
    item("nav-workforce-team", "My team", `${base}?tab=team`, Users),
    item("nav-workforce-leave", "Leave requests", `${base}?tab=leave`, CalendarOff),
    item("nav-workforce-calendar", "Team calendar", `${base}?tab=calendar`, CalendarDays),
    item("nav-workforce-me", "Me", `${base}?tab=me`, User),
  ];
}

function financeChildren(can) {
  const children = [item("nav-workforce-overview", "Overview", createPageUrl("Workforce"), ClipboardList)];
  if (can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push(item("nav-workforce-payroll", "Payroll", createPageUrl("Workforce/payroll"), Wallet));
    children.push(item("nav-workforce-payslips", "Payslips", createPageUrl("Payslips"), Receipt));
  }
  if (can(PERMISSIONS.VIEW_TEAM_MEMBERS) || can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push(item("nav-workforce-reports", "Reports", createPageUrl("Workforce/reports"), BarChart2));
  }
  return children;
}

function hrChildren(can) {
  const children = [item("nav-workforce-overview", "Overview", createPageUrl("Workforce"), ClipboardList)];
  if (can(PERMISSIONS.MANAGE_EMPLOYEES) || can(PERMISSIONS.MANAGE_LEAVE) || can(PERMISSIONS.VIEW_TEAM_MEMBERS)) {
    children.push(item("nav-workforce-employees", "Employees", createPageUrl("Workforce/employees"), Users));
  }
  if (can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push(item("nav-workforce-payroll", "Payroll", createPageUrl("Workforce/payroll"), Wallet));
  }
  if (can(PERMISSIONS.VIEW_TEAM_LEAVE)) {
    children.push(item("nav-workforce-leave", "Leave", createPageUrl("Leave"), CalendarOff));
  } else if (can(PERMISSIONS.VIEW_OWN_LEAVE)) {
    children.push(item("nav-workforce-leave", "Leave", `${createPageUrl("MyPayroll")}?tab=leave`, CalendarOff));
  }
  if (can(PERMISSIONS.VIEW_TEAM_MEMBERS)) {
    children.push(item("nav-workforce-attendance", "Attendance", createPageUrl("Workforce/attendance"), ClipboardList));
  }
  if (can(PERMISSIONS.VIEW_OWN_DOCUMENTS) || can(PERMISSIONS.MANAGE_EMPLOYEES)) {
    children.push(item("nav-workforce-documents", "Documents", createPageUrl("Documents"), FileText));
  }
  if (can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push(item("nav-workforce-payslips", "Payslips", createPageUrl("Payslips"), Receipt));
  } else if (can(PERMISSIONS.VIEW_OWN_PAYSLIPS)) {
    children.push(item("nav-workforce-payslips", "Payslips", createPageUrl("MyPayroll"), Receipt));
  }
  if (can(PERMISSIONS.VIEW_TEAM_MEMBERS) || can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push(item("nav-workforce-reports", "Reports", createPageUrl("Workforce/reports"), BarChart2));
  }
  return children;
}

/**
 * Role-aware Workforce children. Payroll is manage_payroll only.
 * Commercial Document Engine is not a Workforce child.
 *
 * @param {(permission: string) => boolean} hasPermission
 * @param {{ experience?: string | null, membershipId?: string | null }} [opts]
 */
export function getWorkforceNavChildren(hasPermission, opts = {}) {
  const can = typeof hasPermission === "function" ? hasPermission : () => false;
  const experience = opts.experience || null;
  if (experience === WORKFORCE_EXPERIENCES.POS_ONLY) return [];
  if (experience === WORKFORCE_EXPERIENCES.EMPLOYEE) return employeeChildren(opts);
  if (experience === WORKFORCE_EXPERIENCES.MANAGER) return managerChildren();
  if (experience === WORKFORCE_EXPERIENCES.FINANCE) return financeChildren(can);
  return hrChildren(can);
}

export function filterWorkforceNav(hasPermission, opts = {}) {
  return getWorkforceNavChildren(hasPermission, opts);
}
