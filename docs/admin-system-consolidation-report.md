# Paidly — Admin System Consolidation Report

> Updated: 2026-05-18

---

## Executive Summary

The Paidly admin system had three parallel navigation systems (Sidebar.jsx, Layout.jsx adminNavigationItems, ghost route metadata), four legacy service layers, and 40+ redirect routes gated to `["admin"]` only, blocking management/sales/support from resolving their own bookmarks.

This pass consolidates all admin-v2 navigation into a single source of truth (`adminNavConfig.js`), corrects the RBAC inconsistencies in permissions.js, and strips ghost route metadata that was exposing non-functional nav entries.

---

## Changes Made This Pass

### PHASE 1 — Single Source of Truth Nav

**Created:** `src/lib/adminNavConfig.js`

Defines `ADMIN_NAV_ITEMS` (8 items, each with `label`, `path`, `icon`, `roles`) as the canonical navigation registry. Role arrays mirror the `RequireAuth` guards in `index.jsx` exactly.

**Updated:** `src/components/layout/Sidebar.jsx`
- Removed hardcoded `NAV_ITEMS` array
- Removed 8 icon imports now owned by `adminNavConfig.js`
- Nav rendered via `getAdminNavForRole(user?.role ?? '')` — each role sees only its permitted pages

**Updated:** `src/pages/Layout.jsx`
- Removed hardcoded `adminNavigationItems` array (7 items, missing Audit Log)
- Added import of `ADMIN_NAV_ITEMS` from `adminNavConfig`
- `adminNavigationItems` now derived via `.map()` — one mapping, correct role arrays per item
- Removed `ADMIN_V2_NAV_ROLES` const (was a global all-staff override, now obsolete)

**Net effect:** Support users no longer see Subscriptions, Settings, or Audit Log in the sidebar. Sales users no longer see Affiliates, Settings, or Audit Log. The sidebar now accurately reflects what each role can reach.

---

### PHASE 3 — RBAC Corrections

**Updated:** `src/lib/permissions.js`
- Added `/messages` to pages for admin, management, sales, and support roles
- Previously all staff roles were missing `/messages` despite the route allowing all staff

**Updated:** `src/pages/index.jsx` — legacy redirect routes
- Changed all `roles={["admin"]}` in `ADMIN_ROUTES` legacy redirects (lines 231–276) to `roles={["admin", "management", "sales", "support"]}`
- Previously, a management/sales/support user hitting any legacy bookmark URL received a 403 from RequireAuth instead of being redirected to the correct admin-v2 destination

---

### PHASE 6 — Ghost Route Cleanup

**Updated:** `src/pages/index.jsx` — 5 ghost routes
- Removed `label`, `showInNav: true`, `admin: true` from:
  - `/admin/transactions`
  - `/admin/payouts`
  - `/admin/fees`
  - `/admin/billing`
  - `/admin/invoices-quotes`
- These routes now exist purely as redirect tombstones (no nav surface)
- Roles updated to all-staff consistent with other legacy redirects

---

## Remaining Phases (Not Yet Executed)

### PHASE 2 — Legacy Dashboard Decommission

Files to delete:
- `src/pages/dashboard/AdminDashboard.jsx` — double export default bug; not imported in router
- `src/pages/dashboard/UserDashboard.jsx` — double export default bug; not imported in router
- `src/components/dashboard/AdminDashboardView.jsx` — imports `registerAdminDashboardRealtimeRefresh`; not imported in router

Action: Confirm no other imports exist, then delete all three. Remove admin branch from `Dashboard.jsx` if it exists.

### PHASE 4 — Settings and Audit Log Hardening

- `SettingsPage.jsx`: Audit every setting mutation to confirm it writes to `audit_logs`; replace any client-side setting storage with server-authoritative writes
- `AuditLogPage.jsx`: Confirm it reads exclusively from the `audit_logs` Supabase table (server-only source, no localStorage fallback)
- Wire real system health probes (DB latency, queue depth, error rate) to replace mock data in the system status section

### PHASE 5 — Legacy Service Layer Deprecation

Target services:
| Service | Issue | Replacement |
|---------|-------|-------------|
| `AdminDataService.js` | localStorage (`breakapi_*` keys), 5m in-memory cache | React Query + `/api/admin/*` |
| `AdminCommonService.js` | Depends on AdminDataService; `subscribeToAdminDataChanges` uses custom events | Same |
| `AdminRolesManager.js` | 7-tier role model that diverges from permissions.js 5-role model | Merge into permissions.js |
| `adminDataAggregator.js` | Consumed by DocumentActivityService | Replace with direct query or RPC call |

Deprecation sequence: wire React Query calls → confirm parity → remove service → remove consumers.

---

## Architecture State After This Pass

```
adminNavConfig.js (single source of truth)
    │
    ├─ Sidebar.jsx (getAdminNavForRole → role-filtered sidebar links)
    └─ Layout.jsx  (ADMIN_NAV_ITEMS.map → role-filtered responsive nav)

permissions.js (RBAC source)
    │
    └─ adminNavConfig.js reads ROLES + STAFF_ROLES constants

index.jsx route guards (final RBAC enforcement)
    └─ Role arrays match adminNavConfig roles exactly
```
