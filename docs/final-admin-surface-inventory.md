# Paidly — Final Admin Surface Inventory

> Updated: 2026-05-18

---

## Active Admin-v2 Surfaces

These are the only real admin pages. All other admin paths are redirects to one of these.

| Route | Component | Roles | Status |
|-------|-----------|-------|--------|
| `/admin-v2` | `AdminV2Dashboard` | all staff | ✅ Active |
| `/admin-v2/users` | `UsersPage` | all staff | ✅ Active |
| `/admin-v2/messages` | `AdminPlatformMessages` | all staff | ✅ Active |
| `/admin-v2/subscriptions` | `SubscriptionsPage` | admin, management, sales | ✅ Active |
| `/admin-v2/waitlist` | `WaitlistPage` | all staff | ✅ Active |
| `/admin-v2/audit-log` | `AuditLogPage` | admin, management | ✅ Active |
| `/admin-v2/settings` | `SettingsPage` | admin, management | ✅ Active |

---

## Admin Layout Shell

| File | Role |
|------|------|
| `src/components/layout/AdminLayout.jsx` (or similar) | Wraps all /admin-v2/* pages |
| `src/components/layout/Sidebar.jsx` | Role-filtered nav sidebar for admin |

---

## Legacy Redirect Tombstones

40 routes in `ADMIN_ROUTES` (index.jsx lines 231–281) that are pure redirects. No UI is rendered. These exist to handle old bookmarks and external links.

All redirect to `/admin-v2` or a specific `/admin-v2/*` page. All now allow all staff roles (fixed this pass).

| Category | Count | Destination pattern |
|----------|-------|---------------------|
| Legacy PascalCase paths (`/AdminDashboard`, `/AdminUsers`, etc.) | ~18 | `/admin-v2` or `/admin-v2/users`, etc. |
| Legacy `/admin/*` kebab paths | ~17 | Matching `/admin-v2/*` |
| Former ghost routes | 5 | `/admin-v2` or `/admin-v2/subscriptions`, etc. |
| `/BuildLogs` + `/admin/build-logs` | 2 | `/admin-v2` |

---

## Dead Admin Files

All deleted 2026-05-18. Build confirmed clean.

| File | Reason deleted |
|------|---------------|
| `src/pages/dashboard/AdminDashboard.jsx` | No importers; route redirects to /admin-v2 |
| `src/pages/dashboard/UserDashboard.jsx` | No importers |
| `src/components/dashboard/AdminDashboardView.jsx` | No importers |

---

## Legacy Service Layer

All deleted 2026-05-18. The entire chain had zero live consumers outside itself.

| File | Cascade |
|------|---------|
| `src/services/AdminDataService.js` | Root of the chain |
| `src/services/AdminSupabaseSyncService.js` | No external importers |
| `src/services/UserManagementService.js` | No external importers |
| `src/services/SubscriptionManagementService.js` | No external importers |
| `src/services/AdminCommonService.js` | `exportDataAsCSV` extracted to `src/utils/downloadFile.js`; Reports.jsx updated |
| `src/services/AdminRolesManager.js` | No importers anywhere |
| `src/services/SecurityComplianceService.js` | No importers anywhere |
| `src/services/DocumentActivityService.js` | No external importers |
| `src/services/SupportAdminService.js` | No importers anywhere |
| `src/services/DocumentOversightService.js` | No importers anywhere |
| `src/utils/adminDataAggregator.js` | Only DocumentActivityService (also deleted) |
| `src/utils/documentUtils.js` | No importers anywhere |

**`src/lib/adminLocalCache.js` kept** — still used by `SubscriptionService` → `subscriptionUtils` → `SubscriptionActivityRecorder`.

---

## Navigation Surfaces

| Surface | File | Source | Status |
|---------|------|--------|--------|
| Admin sidebar | `src/components/layout/Sidebar.jsx` | `adminNavConfig.js` | ✅ Consolidated |
| Admin layout nav | `src/pages/Layout.jsx` `adminNavigationItems` | `adminNavConfig.js` | ✅ Consolidated |
| Ghost route nav metadata | `src/pages/index.jsx` | (removed) | ✅ Cleaned |

---

## Consolidated Architecture Summary

```
/admin-v2 (ONLY real admin system)
│
├─ 8 active pages (AdminV2Dashboard through SettingsPage)
├─ Navigation: adminNavConfig.js → Sidebar.jsx + Layout.jsx
├─ RBAC: permissions.js → adminNavConfig roles → RequireAuth guards
│
└─ 40 redirect tombstones (ADMIN_ROUTES) — legacy URL compatibility

Dead code fully removed:
  ✅ 3 dead dashboard files deleted (PHASE 2)
  ✅ 12 dead service/utility files deleted (PHASE 5)
  ✅ exportToCsv moved to src/utils/downloadFile.js
```

Engineering rule: **/admin-v2 always wins. SMB app never duplicates admin behavior. Nav items without real functionality must not appear in navigation.**
