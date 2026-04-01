export const ROLES = {
  ADMIN: 'admin',
  MANAGEMENT: 'management',
  SALES: 'sales',
  SUPPORT: 'support',
  USER: 'user',
};

const ROLE_PERMISSIONS = {
  admin: {
    pages: ['/', '/users', '/subscriptions', '/affiliates', '/waitlist', '/settings', '/audit-log'],
    canManageTeam: true,
  },
  management: {
    pages: ['/', '/users', '/subscriptions', '/affiliates', '/waitlist', '/settings', '/audit-log'],
    canManageTeam: true,
  },
  sales: {
    pages: ['/', '/users', '/subscriptions', '/waitlist'],
    canManageTeam: false,
  },
  support: {
    pages: ['/', '/users', '/affiliates', '/waitlist'],
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
  admin: 'Admin',
  management: 'Management',
  sales: 'Sales',
  support: 'Support',
  user: 'User',
};

export const ROLE_DESCRIPTIONS = {
  admin: 'Full access + team management',
  management: 'Full access + team management',
  sales: 'Users, subscriptions, waitlist',
  support: 'Users, affiliates, waitlist',
  user: 'No dashboard access',
};

export const STAFF_ROLES = ['management', 'sales', 'support'];
