import {
  BarChart2,
  CalendarOff,
  ClipboardList,
  Layers,
  Receipt,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { createPageUrl } from "@/utils";
import { PERMISSIONS } from "@/lib/companyPermissions";

export const WORKFORCE_NAV_ID = "nav-workforce";

/**
 * Permission-filtered Workforce children. Payroll is manage_payroll only (HR job
 * function does not imply payroll). Employee payslips go to MyPayroll, not the team list.
 * @param {(permission: string) => boolean} hasPermission
 */
export function getWorkforceNavChildren(hasPermission) {
  const can = typeof hasPermission === "function" ? hasPermission : () => false;
  const children = [
    {
      id: "nav-workforce-overview",
      title: "Overview",
      url: createPageUrl("Workforce"),
      icon: ClipboardList,
    },
  ];

  if (can(PERMISSIONS.MANAGE_EMPLOYEES) || can(PERMISSIONS.MANAGE_LEAVE)) {
    children.push({
      id: "nav-workforce-employees",
      title: "Employees",
      url: createPageUrl("Employees"),
      icon: Users,
    });
  }

  if (
    can(PERMISSIONS.APPROVE_LEAVE) &&
    !can(PERMISSIONS.MANAGE_LEAVE) &&
    !can(PERMISSIONS.MANAGE_PAYROLL)
  ) {
    children.push({
      id: "nav-workforce-team",
      title: "My team",
      url: createPageUrl("Workforce/manager"),
      icon: ClipboardList,
    });
  }

  if (can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push({
      id: "nav-workforce-payroll",
      title: "Payroll",
      url: createPageUrl("Payroll"),
      icon: Wallet,
    });
  }

  if (can(PERMISSIONS.VIEW_TEAM_LEAVE)) {
    children.push({
      id: "nav-workforce-leave",
      title: "Leave",
      url: createPageUrl("Leave"),
      icon: CalendarOff,
    });
  } else if (can(PERMISSIONS.VIEW_OWN_LEAVE)) {
    children.push({
      id: "nav-workforce-leave",
      title: "Leave",
      url: `${createPageUrl("MyPayroll")}?tab=leave`,
      icon: CalendarOff,
    });
  }

  if (can(PERMISSIONS.VIEW_TEAM_MEMBERS) || can(PERMISSIONS.VIEW_OWN_PROFILE)) {
    children.push({
      id: "nav-workforce-attendance",
      title: "Attendance",
      url: createPageUrl("Workforce/attendance"),
      icon: ClipboardList,
    });
  }

  if (can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push({
      id: "nav-workforce-payslips",
      title: "Payslips",
      url: createPageUrl("Payslips"),
      icon: Receipt,
    });
  } else if (can(PERMISSIONS.VIEW_OWN_PAYSLIPS)) {
    children.push({
      id: "nav-workforce-payslips",
      title: "Payslips",
      url: createPageUrl("MyPayroll"),
      icon: Receipt,
    });
  }

  if (can(PERMISSIONS.VIEW_OWN_DOCUMENTS)) {
    children.push({
      id: "nav-workforce-documents",
      title: "Documents",
      url: createPageUrl("Documents"),
      icon: Layers,
    });
  }

  if (can(PERMISSIONS.VIEW_TEAM_MEMBERS) || can(PERMISSIONS.MANAGE_PAYROLL)) {
    children.push({
      id: "nav-workforce-reports",
      title: "Reports",
      url: createPageUrl("Workforce/reports"),
      icon: BarChart2,
    });
  }

  if (
    can(PERMISSIONS.MANAGE_LEAVE) ||
    can(PERMISSIONS.MANAGE_EMPLOYEES) ||
    can(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  ) {
    children.push({
      id: "nav-workforce-settings",
      title: "Settings",
      url: `${createPageUrl("Settings")}?tab=team`,
      icon: Settings,
    });
  }

  return children;
}

export function filterWorkforceNav(hasPermission) {
  return getWorkforceNavChildren(hasPermission);
}
