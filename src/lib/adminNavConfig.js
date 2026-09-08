import {
  LayoutDashboard,
  Activity,
  Building2,
  Users,
  CreditCard,
  Layers,
  Handshake,
  FileText,
  ScrollText,
  Store,
  Banknote,
  Repeat,
  UserRound,
  Wallet,
  CalendarOff,
  Clock,
  Receipt,
  TrendingUp,
  ArrowLeftRight,
  CircleDollarSign,
  AlertTriangle,
  Undo2,
  Workflow,
  Bell,
  LayoutTemplate,
  Plug,
  HeartPulse,
  BarChart3,
  PieChart,
  FileBarChart,
  UsersRound,
  Shield,
  ScrollText as AuditIcon,
  Settings,
  ClipboardList,
  MessageCircle,
} from "lucide-react";
import { ROLES, STAFF_ROLES } from "./permissions";

const ALL_STAFF = [ROLES.ADMIN, ...STAFF_ROLES];
const PRIVILEGED_ONLY = [ROLES.ADMIN, ROLES.MANAGEMENT];
const BILLING_ROLES = [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.SALES];

/**
 * Compact pins still merged into the SMB app sidebar.
 * Full Admin IA lives in ADMIN_NAV_GROUPS.
 */
export const ADMIN_NAV_ITEMS = [
  { label: "Dashboard", path: "/admin-v2", icon: LayoutDashboard, roles: ALL_STAFF },
  { label: "Users", path: "/admin-v2/users", icon: Users, roles: ALL_STAFF },
  { label: "Messages", path: "/admin-v2/messages", icon: MessageCircle, roles: ALL_STAFF },
  { label: "Subscriptions", path: "/admin-v2/subscriptions", icon: CreditCard, roles: BILLING_ROLES },
  { label: "Waitlist", path: "/admin-v2/waitlist", icon: ClipboardList, roles: ALL_STAFF },
  { label: "Audit Log", path: "/admin-v2/audit-log", icon: AuditIcon, roles: PRIVILEGED_ONLY },
  { label: "Settings", path: "/admin-v2/settings", icon: Settings, roles: PRIVILEGED_ONLY },
];

export const ADMIN_NAV_GROUPS = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { label: "Dashboard", path: "/admin-v2", icon: LayoutDashboard, roles: ALL_STAFF },
      { label: "Platform Analytics", path: "/admin-v2/reports/platform", icon: BarChart3, roles: PRIVILEGED_ONLY },
      { label: "Activity", path: "/admin-v2/activity", icon: Activity, roles: ALL_STAFF },
    ],
  },
  {
    id: "business",
    label: "Business",
    items: [
      { label: "Businesses", path: "/admin-v2/businesses", icon: Building2, roles: ALL_STAFF },
      { label: "Users", path: "/admin-v2/users", icon: Users, roles: ALL_STAFF },
      { label: "Subscriptions", path: "/admin-v2/subscriptions", icon: CreditCard, roles: BILLING_ROLES },
      { label: "Plans", path: "/admin-v2/plans", icon: Layers, roles: BILLING_ROLES },
      { label: "Affiliates", path: "/admin-v2/affiliates", icon: Handshake, roles: BILLING_ROLES },
      { label: "Waitlist", path: "/admin-v2/waitlist", icon: ClipboardList, roles: ALL_STAFF },
    ],
  },
  {
    id: "documents",
    label: "Documents",
    items: [
      { label: "Invoice usage", path: "/admin-v2/invoices", icon: FileText, roles: ALL_STAFF },
      { label: "Quote usage", path: "/admin-v2/quotes", icon: ScrollText, roles: ALL_STAFF },
      { label: "POS usage", path: "/admin-v2/pos", icon: Store, roles: ALL_STAFF },
      { label: "Paidly payments", path: "/admin-v2/payments", icon: Banknote, roles: ALL_STAFF },
      { label: "Recurring usage", path: "/admin-v2/recurring", icon: Repeat, roles: ALL_STAFF },
    ],
  },
  {
    id: "workforce",
    label: "Workforce",
    items: [
      { label: "Workforce usage", path: "/admin-v2/employees", icon: UserRound, roles: ALL_STAFF },
      { label: "Payroll usage", path: "/admin-v2/payroll", icon: Wallet, roles: ALL_STAFF },
      { label: "Leave usage", path: "/admin-v2/leave", icon: CalendarOff, roles: ALL_STAFF },
      { label: "Attendance usage", path: "/admin-v2/attendance", icon: Clock, roles: ALL_STAFF },
      { label: "Payslip usage", path: "/admin-v2/payslips", icon: Receipt, roles: ALL_STAFF },
    ],
  },
  {
    id: "financial",
    label: "Financial",
    items: [
      { label: "Revenue", path: "/admin-v2/revenue", icon: TrendingUp, roles: BILLING_ROLES },
      { label: "Transactions", path: "/admin-v2/transactions", icon: ArrowLeftRight, roles: BILLING_ROLES },
      { label: "Payment Intents", path: "/admin-v2/payment-intents", icon: CircleDollarSign, roles: BILLING_ROLES },
      { label: "Failed Payments", path: "/admin-v2/failed-payments", icon: AlertTriangle, roles: BILLING_ROLES },
      { label: "Refunds", path: "/admin-v2/refunds", icon: Undo2, roles: BILLING_ROLES },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    items: [
      { label: "Automations", path: "/admin-v2/automations", icon: Workflow, roles: ALL_STAFF },
      { label: "Notifications", path: "/admin-v2/messages", icon: Bell, roles: ALL_STAFF },
      { label: "Templates", path: "/admin-v2/templates", icon: LayoutTemplate, roles: ALL_STAFF },
      { label: "Integrations", path: "/admin-v2/integrations", icon: Plug, roles: ALL_STAFF },
      { label: "System Health", path: "/admin-v2/system-health", icon: HeartPulse, roles: PRIVILEGED_ONLY },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    items: [
      { label: "Business Reports", path: "/admin-v2/reports/business", icon: Building2, roles: ALL_STAFF },
      { label: "Revenue Reports", path: "/admin-v2/reports/revenue", icon: PieChart, roles: BILLING_ROLES },
      { label: "Document Reports", path: "/admin-v2/reports/documents", icon: FileBarChart, roles: ALL_STAFF },
      { label: "Workforce Reports", path: "/admin-v2/reports/workforce", icon: UsersRound, roles: ALL_STAFF },
      { label: "Platform Analytics", path: "/admin-v2/reports/platform", icon: BarChart3, roles: PRIVILEGED_ONLY },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      { label: "Admin Users", path: "/admin-v2/admin-users", icon: Shield, roles: PRIVILEGED_ONLY },
      { label: "Roles & Permissions", path: "/admin-v2/roles", icon: Users, roles: PRIVILEGED_ONLY },
      { label: "Audit Logs", path: "/admin-v2/audit-log", icon: AuditIcon, roles: PRIVILEGED_ONLY },
      { label: "Settings", path: "/admin-v2/settings", icon: Settings, roles: PRIVILEGED_ONLY },
    ],
  },
];

export function flattenAdminNavItems(groups = ADMIN_NAV_GROUPS) {
  return groups.flatMap((group) => group.items || []);
}

export function getAdminNavGroupsForRole(role) {
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: (group.items || []).filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

export function getAdminNavForRole(role) {
  return ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function findAdminNavItem(pathname) {
  const exact = flattenAdminNavItems().find((item) => item.path === pathname);
  if (exact) return exact;
  return flattenAdminNavItems()
    .filter((item) => item.path !== "/admin-v2" && pathname.startsWith(item.path))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;
}
