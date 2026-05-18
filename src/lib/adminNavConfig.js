import {
  LayoutDashboard,
  Users,
  MessageCircle,
  CreditCard,
  UserCheck,
  ClipboardList,
  ScrollText,
  Settings,
} from 'lucide-react';
import { ROLES, STAFF_ROLES } from './permissions';

const ALL_STAFF = [ROLES.ADMIN, ...STAFF_ROLES];
const PRIVILEGED_ONLY = [ROLES.ADMIN, ROLES.MANAGEMENT];

/**
 * Canonical admin-v2 navigation definition.
 * Roles mirror the RequireAuth guards in index.jsx — keep them in sync.
 */
export const ADMIN_NAV_ITEMS = [
  { label: 'Dashboard',     path: '/admin-v2',               icon: LayoutDashboard, roles: ALL_STAFF },
  { label: 'Users',         path: '/admin-v2/users',         icon: Users,           roles: ALL_STAFF },
  { label: 'Messages',      path: '/admin-v2/messages',      icon: MessageCircle,   roles: ALL_STAFF },
  { label: 'Subscriptions', path: '/admin-v2/subscriptions', icon: CreditCard,      roles: [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.SALES] },
  { label: 'Affiliates',    path: '/admin-v2/affiliates',    icon: UserCheck,       roles: [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.SUPPORT] },
  { label: 'Waitlist',      path: '/admin-v2/waitlist',      icon: ClipboardList,   roles: ALL_STAFF },
  { label: 'Audit Log',     path: '/admin-v2/audit-log',     icon: ScrollText,      roles: PRIVILEGED_ONLY },
  { label: 'Settings',      path: '/admin-v2/settings',      icon: Settings,        roles: PRIVILEGED_ONLY },
];

export function getAdminNavForRole(role) {
  return ADMIN_NAV_ITEMS.filter((item) => item.roles.includes(role));
}
