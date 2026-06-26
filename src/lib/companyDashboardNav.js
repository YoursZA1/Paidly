import { createPageUrl } from "@/utils";
import { PERMISSIONS } from "@/lib/companyPermissions";
import {
  Receipt,
  CalendarOff,
  Layers,
  User,
  Users,
  FileText,
  BarChart2,
  Settings,
  ClipboardList,
  Wallet,
  PlusCircle,
} from "lucide-react";

/**
 * Unified company workspace navigation — filtered by permission, not hardcoded role checks.
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   url: string,
 *   icon: import('lucide-react').LucideIcon,
 *   requiredPermission?: string,
 *   section?: string,
 *   hideWhenPermission?: string,
 * }} CompanyNavItem
 */

/** @type {CompanyNavItem[]} */
export const COMPANY_WORKSPACE_NAV = [
  {
    id: "company-nav-my-payslips",
    title: "My Payslips",
    description: "View payslips assigned to you.",
    url: createPageUrl("Payslips"),
    icon: Receipt,
    requiredPermission: PERMISSIONS.VIEW_OWN_PAYSLIPS,
    section: "Me",
  },
  {
    id: "company-nav-request-leave",
    title: "Request Leave",
    description: "Submit a new leave request for approval.",
    url: createPageUrl("CreateLeaveRequest"),
    icon: PlusCircle,
    requiredPermission: PERMISSIONS.VIEW_OWN_LEAVE,
    section: "Me",
  },
  {
    id: "company-nav-my-leave",
    title: "My Leave",
    description: "Track your leave requests and balances.",
    url: `${createPageUrl("Documents")}?type=leave_request`,
    icon: CalendarOff,
    requiredPermission: PERMISSIONS.VIEW_OWN_LEAVE,
    section: "Me",
  },
  {
    id: "company-nav-request-expense",
    title: "Submit Expense",
    description: "File an expense claim for reimbursement.",
    url: createPageUrl("CreateExpenseClaim"),
    icon: PlusCircle,
    requiredPermission: PERMISSIONS.VIEW_OWN_DOCUMENTS,
    section: "Me",
  },
  {
    id: "company-nav-my-expenses",
    title: "My Expense Claims",
    description: "Track expense claims you have submitted.",
    url: `${createPageUrl("Documents")}?type=expense_claim`,
    icon: Wallet,
    requiredPermission: PERMISSIONS.VIEW_OWN_DOCUMENTS,
    section: "Me",
  },
  {
    id: "company-nav-my-documents",
    title: "My Documents",
    description: "Employment and personal documents.",
    url: createPageUrl("Documents"),
    icon: Layers,
    requiredPermission: PERMISSIONS.VIEW_OWN_DOCUMENTS,
    section: "Me",
  },
  {
    id: "company-nav-profile",
    title: "My Profile",
    description: "Update your profile and preferences.",
    url: createPageUrl("Settings"),
    icon: User,
    requiredPermission: PERMISSIONS.VIEW_OWN_PROFILE,
    section: "Me",
  },
  {
    id: "company-nav-team",
    title: "Team Members",
    description: "People in your company.",
    url: `${createPageUrl("Settings")}?tab=team`,
    icon: Users,
    requiredPermission: PERMISSIONS.VIEW_TEAM_MEMBERS,
    section: "Team",
  },
  {
    id: "company-nav-team-leave",
    title: "Leave Requests",
    description: "Review pending team leave.",
    url: `${createPageUrl("Documents")}?status=pending&type=leave_request`,
    icon: ClipboardList,
    requiredPermission: PERMISSIONS.VIEW_TEAM_LEAVE,
    hideWhenPermission: PERMISSIONS.MANAGE_LEAVE,
    section: "Team",
  },
  {
    id: "company-nav-team-docs",
    title: "Team Documents",
    description: "Documents shared across your company.",
    url: createPageUrl("Documents"),
    icon: FileText,
    requiredPermission: PERMISSIONS.VIEW_TEAM_DOCUMENTS,
    section: "Team",
  },
  {
    id: "company-nav-team-payroll",
    title: "Team Payroll Summary",
    description: "Payslip overview for your team.",
    url: createPageUrl("Payslips"),
    icon: Wallet,
    requiredPermission: PERMISSIONS.VIEW_TEAM_PAYROLL_SUMMARY,
    hideWhenPermission: PERMISSIONS.MANAGE_PAYROLL,
    section: "Team",
  },
  {
    id: "company-nav-employees",
    title: "Manage Employees",
    description: "Invite and manage company members.",
    url: `${createPageUrl("Settings")}?tab=team`,
    icon: Users,
    requiredPermission: PERMISSIONS.MANAGE_EMPLOYEES,
    section: "Company",
  },
  {
    id: "company-nav-payroll",
    title: "Payroll",
    description: "Run payroll and manage payslips.",
    url: createPageUrl("Payslips"),
    icon: Wallet,
    requiredPermission: PERMISSIONS.MANAGE_PAYROLL,
    section: "Company",
  },
  {
    id: "company-nav-leave-mgmt",
    title: "Leave Management",
    description: "Approve and manage team leave.",
    url: `${createPageUrl("Documents")}?status=pending&type=leave_request`,
    icon: CalendarOff,
    requiredPermission: PERMISSIONS.MANAGE_LEAVE,
    section: "Company",
  },
  {
    id: "company-nav-reports",
    title: "Company Reports",
    description: "Financial and HR reports for your company.",
    url: createPageUrl("Reports"),
    icon: BarChart2,
    requiredPermission: PERMISSIONS.VIEW_COMPANY_REPORTS,
    section: "Company",
  },
  {
    id: "company-nav-settings",
    title: "Company Settings",
    description: "Manage company profile and policies.",
    url: createPageUrl("Settings"),
    icon: Settings,
    requiredPermission: PERMISSIONS.MANAGE_COMPANY_SETTINGS,
    section: "Company",
  },
];

export const COMPANY_WORKSPACE_SECTIONS = ["Me", "Team", "Company"];

/**
 * @param {(permission: string) => boolean} hasPermission
 * @returns {CompanyNavItem[]}
 */
export function filterCompanyWorkspaceNav(hasPermission) {
  return COMPANY_WORKSPACE_NAV.filter((item) => {
    if (item.hideWhenPermission && hasPermission(item.hideWhenPermission)) return false;
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission);
  });
}

/**
 * Dedupe nav items that share the same url+title.
 * @param {CompanyNavItem[]} items
 */
export function dedupeCompanyNavItems(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = `${item.url}::${item.title}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

/**
 * Permission-filtered workspace items grouped by section (Me / Team / Company).
 * @param {(permission: string) => boolean} hasPermission
 * @returns {Array<{ section: string, items: CompanyNavItem[] }>}
 */
export function getCompanyWorkspaceSections(hasPermission) {
  const items = dedupeCompanyNavItems(filterCompanyWorkspaceNav(hasPermission));
  return COMPANY_WORKSPACE_SECTIONS.map((section) => ({
    section,
    items: items.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0);
}

/** @deprecated Use COMPANY_WORKSPACE_NAV — kept for any legacy imports */
export const COMPANY_DASHBOARD_NAV = COMPANY_WORKSPACE_NAV;

/** @deprecated Use filterCompanyWorkspaceNav */
export function filterCompanyDashboardNav(hasPermission) {
  return filterCompanyWorkspaceNav(hasPermission);
}
