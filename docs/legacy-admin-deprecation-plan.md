# Paidly — Legacy Admin Deprecation Plan

> Updated: 2026-05-18

---

## Deprecation Targets

### Target 1 — AdminDashboard.jsx

**File:** `src/pages/dashboard/AdminDashboard.jsx`

**Status:** Dead code. Route `/AdminDashboard` in `index.jsx` redirects to `/admin-v2`. File is never imported.

**Known bug:** Double `export default` at end of file (lines 80–81). This would cause a compile error if ever imported.

**Action:**
1. Confirm `grep -r "AdminDashboard" src --include="*.jsx" --include="*.js" --include="*.ts" --include="*.tsx"` shows only the file itself and the redirect route in index.jsx
2. Delete the file
3. The redirect route in index.jsx (`/AdminDashboard → /admin-v2`) should remain as a tombstone

---

### Target 2 — UserDashboard.jsx

**File:** `src/pages/dashboard/UserDashboard.jsx`

**Status:** Dead code. Not imported in the router. Not referenced in index.jsx.

**Known bug:** Double `export default` at end of file (lines 74–75).

**Action:**
1. Confirm no imports exist
2. Delete the file

---

### Target 3 — AdminDashboardView.jsx

**File:** `src/components/dashboard/AdminDashboardView.jsx`

**Status:** Dead code. Not imported in the router or any active component. Imports `registerAdminDashboardRealtimeRefresh` from `realtimeStoreHydration`.

**Action:**
1. Confirm no imports exist
2. Delete the file
3. Check if `registerAdminDashboardRealtimeRefresh` is still referenced by any live component; if `AdminDashboardView.jsx` was its only consumer, the export in `realtimeStoreHydration` can be removed too

---

### Target 4 — AdminDataService.js

**File:** `src/services/AdminDataService.js`

**Status:** Active but architecturally wrong. Uses localStorage (`breakapi_*` and `breakapi_supabase_*` keys) for data persistence with a 5-minute in-memory cache. Three consumers: `AdminSupabaseSyncService`, `UserManagementService`, `SubscriptionManagementService`.

**Replacement:** React Query hooks backed by `/api/admin/*` Supabase RPC calls.

**Deprecation sequence:**
1. Audit which Supabase tables each AdminDataService method reads
2. Create corresponding `useQuery` hooks in `src/hooks/admin/`
3. Replace each consumer one by one, verifying parity
4. Remove the `breakapi_*` localStorage keys from all places that write them
5. Delete `AdminDataService.js`

**Risk:** `AdminSupabaseSyncService` may have write paths that need to be preserved. Audit before deleting.

---

### Target 5 — AdminCommonService.js

**File:** `src/services/AdminCommonService.js`

**Status:** Utility layer. Pure functions (formatDate, formatCurrency, filterData, sortData, exportDataAsCSV/JSON) plus `refreshAllAdminData()` (dynamically imports AdminDataService) and `subscribeToAdminDataChanges()` (listens to `window.dispatchEvent("adminDataChanged")`).

**Action:**
- Pure utility functions (`formatDate`, `formatCurrency`, `filterData`, `sortData`): Move to `src/lib/adminUtils.js` or a more specific utility module
- `exportDataAsCSV` / `exportDataAsJSON`: Move to `src/lib/exportUtils.js` (likely already used elsewhere)
- `refreshAllAdminData()` / `subscribeToAdminDataChanges()`: Delete after AdminDataService is gone (these are the event-bus glue for the legacy push model)
- `generateReportSummary()`: Evaluate whether it's still needed; if so, move to report-specific utility

---

### Target 6 — AdminRolesManager.js

**File:** Source file for AdminRolesManager (exact path from `src/services/` or similar)

**Status:** 7-tier role model that diverges from `permissions.js` 5-role model (admin, management, sales, support, user). The 7-tier model adds granularity that the platform does not enforce at the route or UI level.

**Action:**
1. Audit which components use `AdminRolesManager` — expected consumers: SettingsPage.jsx (team management), possibly TeamMembers.jsx
2. Map 7-tier roles → 5-tier roles in permissions.js
3. Add any missing role metadata (labels, descriptions) to permissions.js
4. Update consumers to use `ROLES`, `ROLE_LABELS`, `ROLE_DESCRIPTIONS` from permissions.js
5. Delete AdminRolesManager.js

---

### Target 7 — adminDataAggregator.js

**File:** `src/services/adminDataAggregator.js` (or similar)

**Status:** Consumed by `DocumentActivityService`. Aggregates data from AdminDataService.

**Action:** Replace with a direct Supabase query or RPC call in DocumentActivityService after AdminDataService is deprecated. Delete once consumers are migrated.

---

## Deprecation Priority Order

```
1. AdminDashboard.jsx, UserDashboard.jsx, AdminDashboardView.jsx  ← zero-risk, no consumers
2. adminDataAggregator.js                                          ← after DocumentActivityService migration
3. AdminRolesManager.js                                            ← after SettingsPage migration
4. AdminDataService.js → AdminSupabaseSyncService, UserManagementService, SubscriptionManagementService
5. AdminCommonService.js                                           ← last, after all consumers migrated
```

---

## localStorage Key Cleanup

When AdminDataService is removed, these localStorage keys should be purged from user browsers:
- All keys matching `breakapi_*`
- All keys matching `breakapi_supabase_*`

Add a one-time migration in the app boot sequence:
```js
// Run once after AdminDataService removal ships
['breakapi_', 'breakapi_supabase_'].forEach(prefix => {
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
});
```
