# Paidly — Unified RBAC Mapping

> Updated: 2026-05-18

---

## Role Definitions

| Role | Label | Can Manage Team | Description |
|------|-------|-----------------|-------------|
| `admin` | Admin | ✅ | Full access + team management |
| `management` | Management | ✅ | Full access + team management |
| `sales` | Sales | ❌ | Users, subscriptions, waitlist, messages |
| `support` | Support | ❌ | Users, waitlist, messages |
| `user` | User | ❌ | No dashboard access |

`STAFF_ROLES = ['management', 'sales', 'support']`

---

## Admin-v2 Page Access Matrix

This table is the single authoritative cross-reference. The three columns must always agree — if you change one, change all three.

| Page | Route | Route Guard Roles | Nav Config Roles | permissions.js page |
|------|-------|------------------|-----------------|---------------------|
| Dashboard | `/admin-v2` | admin, management, sales, support | admin, management, sales, support | `/` |
| Users | `/admin-v2/users` | admin, management, sales, support | admin, management, sales, support | `/users` |
| Messages | `/admin-v2/messages` | admin, management, sales, support | admin, management, sales, support | `/messages` |
| Subscriptions | `/admin-v2/subscriptions` | admin, management, sales | admin, management, sales | `/subscriptions` |
| Waitlist | `/admin-v2/waitlist` | admin, management, sales, support | admin, management, sales, support | `/waitlist` |
| Audit Log | `/admin-v2/audit-log` | admin, management | admin, management | `/audit-log` |
| Settings | `/admin-v2/settings` | admin, management | admin, management | `/settings` |

**Enforcement:** Route guard (`RequireAuth roles`) is the server-adjacent enforcement layer. Nav filtering is a UX layer — it prevents users from seeing links they can't access, but the route guard always wins.

---

## Effective Access By Role

### admin + management (identical)
Dashboard, Users, Messages, Subscriptions, Waitlist, Audit Log, Settings

### sales
Dashboard, Users, Messages, Subscriptions, Waitlist

### support
Dashboard, Users, Messages, Waitlist

---

## Server-Side RBAC (adminRouteAccess.js)

The server enforces its own role checks independently of the frontend. Frontend role guards are a UX gate only.

| Server Permission Set | Roles |
|-----------------------|-------|
| `INTERNAL_ADMIN_READ_ROLES` | admin, management, support, sales |
| `TEAM_INVITE_PROFILE_ROLES` | admin, management |

**Note:** `INTERNAL_ADMIN_READ_ROLES` includes all staff — consistent with the frontend "all staff" pages (Dashboard, Users, Messages, Waitlist). The server does not separately gate Messages; it's a general staff-read endpoint.

---

## RBAC Inconsistencies Fixed This Pass

| Issue | Before | After |
|-------|--------|-------|
| `/messages` missing from all permissions.js roles | Not in any role's pages | Added to admin, management, sales, support |
| Sidebar showed all 8 items to all staff | No per-item role filter | Sidebar uses `getAdminNavForRole(role)` |
| Layout.jsx showed Subscriptions to support | `ADMIN_V2_NAV_ROLES` for all items | Per-item roles from adminNavConfig |
| Layout.jsx showed Settings to sales + support | `ADMIN_V2_NAV_ROLES` for all items | `PRIVILEGED_ONLY` in adminNavConfig |
| Layout.jsx showed Audit Log to sales + support | `ADMIN_V2_NAV_ROLES` for all items | `PRIVILEGED_ONLY` in adminNavConfig |
| Layout.jsx missing Audit Log entirely | 7 items, Audit Log absent | Now 8 items via adminNavConfig |
| Legacy redirects required `["admin"]` only | management/sales/support got 403 on old bookmarks | All staff allowed on redirect tombstones |

---

## RBAC Remaining Gaps

| Gap | File | Severity | Action |
|-----|------|----------|--------|
| `AdminRolesManager.js` has a 7-tier model that diverges from 5-role permissions.js | `src/services/AdminRolesManager.js` | Medium | Migrate to permissions.js; see legacy-admin-deprecation-plan.md |
| SettingsPage team management uses canManageTeam flag but does not cross-check against server permission | `src/pages/admin-v2/SettingsPage.jsx` | Low | PHASE 4 hardening |
| canAccess() is called with short paths (`/users`, `/settings`) but nav items use full paths (`/admin-v2/users`) | `src/lib/permissions.js` | Low | Clarify which callers use canAccess() and whether the short-path contract is intentional |
