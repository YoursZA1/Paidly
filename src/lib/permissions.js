export const ROLES = {
  ADMIN: 'admin',
  MANAGEMENT: 'management',
  SALES: 'sales',
  SUPPORT: 'support',
  USER: 'user',
};

const ROLE_PERMISSIONS = {
  admin: {
    pages: ['/', '/users', '/messages', '/subscriptions', '/waitlist', '/settings', '/audit-log'],
    canManageTeam: true,
  },
  management: {
    pages: ['/', '/users', '/messages', '/subscriptions', '/waitlist', '/settings', '/audit-log'],
    canManageTeam: true,
  },
  sales: {
    pages: ['/', '/users', '/messages', '/subscriptions', '/waitlist'],
    canManageTeam: false,
  },
  support: {
    pages: ['/', '/users', '/messages', '/waitlist'],
    canManageTeam: false,
  },
  user: {
    pages: ['/'],
    canManageTeam: false,
  },
};

export function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
}

export function canAccess(role, page) {
  return getPermissions(role).pages.includes(page);
}

export const ROLE_LABELS = {
  admin: 'Super Admin',
  management: 'Operations',
  sales: 'Sales',
  support: 'Support',
  user: 'User',
};

export const ROLE_DESCRIPTIONS = {
  admin: 'Super Admin — full platform access, billing writes, and staff management',
  management: 'Operations — users, businesses, subscriptions, and platform health',
  sales: 'Sales / finance overview — growth, subscriptions, plans, and Paidly revenue',
  support: 'Support — users, businesses, messages, and operational lists',
  user: 'No dashboard access',
};

export const STAFF_ROLES = ['management', 'sales', 'support'];
