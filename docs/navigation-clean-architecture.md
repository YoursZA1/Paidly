# Paidly — Navigation Clean Architecture

> Updated: 2026-05-18

---

## Before This Pass

Three divergent nav registries for admin-v2:

```
Sidebar.jsx
  NAV_ITEMS (8 items, hardcoded, no role filtering)
  → all 8 items visible to ALL staff regardless of role

Layout.jsx
  adminNavigationItems (7 items — MISSING Audit Log)
  → all items had ADMIN_V2_NAV_ROLES (all staff), no per-item filtering
  → Subscriptions visible to support, Affiliates visible to sales,
    Settings visible to sales/support — all incorrect

index.jsx route objects
  5 ghost routes: { showInNav: true, admin: true, label: "..." }
  → external systems could read these as nav entries
```

Problems:
- RBAC inconsistency: nav showed pages users couldn't access
- Audit Log missing from Layout.jsx nav (it's in Sidebar but not Layout)
- Ghost routes polluting nav configuration space

---

## After This Pass

Single source of truth with role filtering:

```
src/lib/adminNavConfig.js
│
│  ADMIN_NAV_ITEMS — 8 items, each with: label, path, icon, roles[]
│  getAdminNavForRole(role) — returns filtered subset
│
├─► Sidebar.jsx
│     getAdminNavForRole(user.role) → render only accessible links
│
└─► Layout.jsx
      ADMIN_NAV_ITEMS.map() → adminNavigationItems
      getNavigationItems() computes hasRoleAccess per item
      → existing rendering logic unchanged
```

---

## Admin-v2 Navigation Items

| Label | Path | Admin | Mgmt | Sales | Support |
|-------|------|-------|------|-------|---------|
| Dashboard | `/admin-v2` | ✅ | ✅ | ✅ | ✅ |
| Users | `/admin-v2/users` | ✅ | ✅ | ✅ | ✅ |
| Messages | `/admin-v2/messages` | ✅ | ✅ | ✅ | ✅ |
| Subscriptions | `/admin-v2/subscriptions` | ✅ | ✅ | ✅ | ❌ |
| Affiliates | `/admin-v2/affiliates` | ✅ | ✅ | ❌ | ✅ |
| Waitlist | `/admin-v2/waitlist` | ✅ | ✅ | ✅ | ✅ |
| Audit Log | `/admin-v2/audit-log` | ✅ | ✅ | ❌ | ❌ |
| Settings | `/admin-v2/settings` | ✅ | ✅ | ❌ | ❌ |

---

## File Responsibilities After Consolidation

| File | Responsibility |
|------|---------------|
| `src/lib/adminNavConfig.js` | Nav item registry + role arrays. Single write point. |
| `src/lib/permissions.js` | Role definitions, page-level canAccess(), ROLE_LABELS |
| `src/components/layout/Sidebar.jsx` | Renders filtered nav items for admin layout |
| `src/pages/Layout.jsx` | Derives adminNavigationItems from config; merges with main app nav for staff |
| `src/pages/index.jsx` | RequireAuth role guards — the enforcement layer |
| `server/src/adminRouteAccess.js` | Server-side RBAC — independent enforcement |

---

## Invariants

1. **One registry:** The ONLY place to add/remove/rename an admin-v2 nav item is `adminNavConfig.js`.
2. **Role parity:** The `roles` array in each `ADMIN_NAV_ITEMS` entry must exactly match the `roles` array in the corresponding `RequireAuth` in `index.jsx`.
3. **No showInNav in route objects:** Route objects in `ADMIN_ROUTES` are pure routing config. Nav presence is controlled exclusively by `adminNavConfig.js`.
4. **Sidebar reads user.role at render time:** No static nav list. Every render reflects the current user's role.

---

## Main App Nav (SMB Customers)

The main app nav (`allNavigationItems` in Layout.jsx) is separate and uses `MAIN_APP_NAV_ROLES`. It does not intersect with admin-v2 nav.

Staff users see both: `getNavigationItems()` merges `allNavigationItems + adminNavigationItems` for staff dashboard roles, deduped by `id`.

Admin-only behavior should NEVER appear in the main app nav items — `/admin-v2` paths should not appear in `allNavigationItems`.

---

## Removed Ghost Routes

These routes existed with `showInNav: true` but rendered only a `<Navigate>` redirect. They have been stripped to bare redirect tombstones:

| Old path | Was labeled | Redirects to |
|----------|-------------|--------------|
| `/admin/transactions` | "Transactions" | `/admin-v2` |
| `/admin/payouts` | "Payouts" | `/admin-v2/affiliates` |
| `/admin/fees` | "Fees" | `/admin-v2/subscriptions` |
| `/admin/billing` | "Billing" | `/admin-v2/subscriptions` |
| `/admin/invoices-quotes` | "Invoices & Quotes" | `/admin-v2` |

These redirect tombstones should eventually be removed entirely when there is confidence no external links or bookmarks target them.
