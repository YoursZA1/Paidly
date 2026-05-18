# Paidly — Remaining Risk Analysis

> Updated: 2026-05-18

---

## Risk Classification

| Tier | Description | Action Required |
|------|-------------|----------------|
| P0 — Critical | Would cause data loss, auth breakage, or complete reconnect storm | Fix immediately |
| P1 — High | Causes noticeable latency, unnecessary requests, or degraded UX under load | Fix in next sprint |
| P2 — Medium | Sub-optimal behavior visible only under extreme load or uncommon scenarios | Fix opportunistically |
| P3 — Low | Cosmetic, logging, or theoretical edge cases | Track only |

---

## P1 — High Risk

### 1. Raw `getSession()` Calls in Feature Code (40+ sites)

**Risk:** Feature-layer components and API clients call `supabase.auth.getSession()` directly rather than routing through `SessionCoordinator`. During burst scenarios (tab focus + sync + realtime event burst), these calls can stack with the coordinator's managed calls and push against GoTrue's rate limits.

**Most impactful uncentralized callers:**
- `src/components/reminders/PaymentReminderService.jsx` (2 calls — timer-driven, fires frequently)
- `src/api/affiliateClient.js` (3 calls — per-request pre-flight)
- `src/services/ActivityNotificationService.js` (2 calls — event-driven)
- `src/lib/rpcSessionPolicy.js` (2 calls — used in RPC middleware, potentially high frequency)

**Excluded from concern (correct to call directly):**
- `src/contexts/AuthContext.impl.jsx` — auth management layer
- `src/lib/supabaseAuthRefresh.js` — refresh implementation
- `src/api/auth/authSessionHelpers.js` — auth utility layer
- `src/api/auth/AuthManager.js` — session management

**Fix:** Route high-frequency callers through `getStableSession()` or `hasActiveSession()` from `SessionCoordinator`. Single-action callers (PDF generation, one-off sends) are lower priority.

---

### 2. `invalidateClientDomain` Cascades into `invalidateInvoiceDomain`

**Risk:** `invalidateClientDomain` calls `invalidateInvoiceDomain` internally. A realtime client update triggers invalidations of: client list + invoice list + invoice-list/scopeKey + invoice detail + cashflow. This is 5+ cache invalidations per client change — including the broad `["invoices"]` legacy root.

**File:** `src/lib/queryInvalidation.js:37` — `invalidateClientDomain` calls `invalidateInvoiceDomain`

**Risk level:** Medium-to-high when client data changes frequently (e.g., admin bulk imports).

**Fix:** Remove the `invalidateInvoiceDomain(queryClient, { scopeKey })` call from `invalidateClientDomain`. Client changes don't require invalidating invoice data unless the client's billing fields changed — and even then, only the detail view, not the invoice list.

---

### 3. Legacy `["invoices"]` Broad Query Key Still Exists

**Risk:** `invalidateInvoiceDomain` always invalidates `{ queryKey: ["invoices"], exact: false }`. Any query that happens to use `["invoices"]` as the first key element gets invalidated on every invoice event, regardless of whether it's stale. If new hooks are added with `queryKey: ["invoices", ...]`, they will be caught by this broad key.

**File:** `src/lib/queryInvalidation.js:23`

**Comment in file:** "Legacy roots — remove after hook migration completes"

**Fix:** Audit which hooks still use `["invoices"]` as a root (not `["invoices", "list"]` or `["invoices", "detail", id]`), then narrow the key or remove the broad invalidation. This is blocked on hook migration status.

---

## P2 — Medium Risk

### 4. `recordAndCheckReconnectRate()` Not Enforced

**Risk:** `RuntimeBudgetCoordinator.recordAndCheckReconnectRate()` was written to prevent the app from exceeding 15 reconnects per 60 seconds, but it is not called from any reconnect path. The actual rate limiting is handled by `paidlyRealtimeManager.js`'s own circuit breakers — but those are realtime-specific. HTTP reconnect attempts have no cross-system rate tracking.

**File:** `src/core/runtime/RuntimeBudgetCoordinator.ts` — `recordAndCheckReconnectRate` is unused

**Fix:** Call `recordAndCheckReconnectRate()` from `authReconnectEscalation.js` and `ConnectionLifecycleManager` before each reconnect attempt. Return early if it returns `false`.

---

### 5. `consumeFocusRefetchBudget()` Not Enforced

**Risk:** `RuntimeBudgetCoordinator.consumeFocusRefetchBudget()` limits focus-triggered refetches to 8 per 3 seconds, but it is not called from any focus handler. TanStack Query's `refetchOnWindowFocus: true` opt-in queries (FocusRefetch.LIVE) are uncapped.

**In practice:** Currently only `notifications`, `admin-messages`, and `services catalog` have `FocusRefetch.LIVE`. With 3 queries opted in, this is not yet a problem. Becomes relevant as more live queries are added.

**Fix:** Add `consumeFocusRefetchBudget()` as a guard in `queryFocusPolicy.ts` or as a custom focus observer, before each focus-triggered refetch is allowed to proceed.

---

### 6. `Axios` Backend Client Bypasses `RequestCoordinator`

**Risk:** The Axios-based backend client does not use `RequestCoordinator.withSlot()`, meaning its concurrent requests are not subject to the 6-slot cap. Under recovery (when `pauseNonCriticalRequests = true`), Axios requests proceed unimpeded while TanStack Query hooks pause.

**Status:** Documented as a known TODO in `runtime-budgeting-strategy.md` (Layer 2 section).

**Fix:** Wrap Axios interceptors with `requestCoordinator.withSlot()` or a middleware that checks `RequestCoordinator.shouldPause()` and awaits `waitUntilUnpaused()`.

---

### 7. `SyncEngine.scheduleGlobalStoreRefresh` Still Calls `fetchAllFromStore`

**Risk:** For non-admin users, when `invalidateForEntity` returns `false` (reconciliation failed), `scheduleGlobalStoreRefresh` calls `fetchAllFromStore(user)`. This is the full-reload fallback for non-admin users. Currently all reconcilers return `true`, so this path does not fire in practice — but if a reconciler encounters a payload shape it doesn't recognize and returns `false`, the full reload fires silently.

**Risk level:** Low in practice (all reconcilers return `true`), but a code path that can cause a large refetch exists.

**Fix:** Remove or alarm on the `fetchAllFromStore` call in `scheduleGlobalStoreRefresh`. Replace with targeted invalidation of the affected entity's known query keys.

---

## P3 — Low Risk / Track Only

### 8. Multiple `auth.getSession()` Calls During Auth Context Init

**Risk:** `AuthContext.impl.jsx` has 9 raw `getSession()` calls across its initialization and event handlers. These are all in the auth management layer and are expected — but during cold start, if multiple auth events fire in the same event loop turn, they could issue parallel reads.

**Status:** `RefreshQueue` serializes refresh calls. The `getSession()` calls during init (`onAuthStateChange` handlers) cannot route through `SessionCoordinator` without circular dependency risk (SessionCoordinator imports `supabase`, AuthContext provides auth state).

**Fix:** Not required; document as an accepted boundary.

---

### 9. `paidlyRealtimeReconciliationEngine.whenDocumentVisible` Max Wait of 120s

**Risk:** A tab hidden for >120 seconds with pending entity invalidation timers will trigger those invalidations without waiting for visibility, since `whenDocumentVisible` resolves after 120 seconds regardless. If the tab then becomes visible, the entity invalidations fire against a potentially stale auth state.

**Fix:** The 120s timeout is a safety escape hatch; the auth guard (`hasActiveSession()`) after `whenDocumentVisible` resolves prevents acting on a stale session. Acceptable.

---

## Summary

| # | Risk | Tier | Status |
|---|------|------|--------|
| 1 | Raw `getSession()` in high-frequency feature code | P1 | Open |
| 2 | `invalidateClientDomain` cascade into invoice domain | P1 | Open |
| 3 | Legacy `["invoices"]` broad query key | P1 | Open (blocked on migration) |
| 4 | `recordAndCheckReconnectRate` not enforced | P2 | Open |
| 5 | `consumeFocusRefetchBudget` not enforced | P2 | Open |
| 6 | Axios bypasses `RequestCoordinator` | P2 | Known TODO |
| 7 | `fetchAllFromStore` fallback still reachable | P2 | Low risk in practice |
| 8 | Parallel `getSession()` during auth init | P3 | Accepted boundary |
| 9 | `whenDocumentVisible` 120s timeout escape | P3 | Acceptable |
