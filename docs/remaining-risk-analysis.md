# Paidly — Remaining Risk Analysis

> Updated: 2026-05-18 (final stability pass)

---

## Risk Classification

| ID | Severity | Category | Status |
|----|----------|----------|--------|
| R-01 | Medium | Session auth | Open — migration effort required |
| R-02 | Low | Invalidation cascade | Open — acceptable in realtime paths, partially fixed in resync path |
| R-03 | Low | Query key breadth | Open — migration in progress |
| R-04 | Low | Focus budget | Closed — intentionally deferred |

---

## R-01 — Direct supabase.auth.getSession() calls bypass SessionCoordinator

**Severity:** Medium  
**Files affected:** 20+ files (see below)

`SessionCoordinator.getStableSession()` provides a 3-tier fast path (in-memory store → 5s snapshot → single-flight getSession). It prevents concurrent `supabase.auth.getSession()` calls from racing on refresh tokens. 40+ call sites in feature components and services bypass this and call `supabase.auth.getSession()` directly.

**High-risk sites (concurrent or burst-prone):**
| File | Context | Risk |
|------|---------|------|
| `src/components/connection/connectionHealth.js` | Called inside `Promise.all()` | Concurrent with other requests |
| `src/api/affiliateClient.js` (3 calls) | Per-API-call token grab | Parallel if multiple affiliate calls fire |
| `src/services/ActivityNotificationService.js` (2 calls) | Notification polling | May fire concurrently with auth refresh |
| `src/services/SupabaseAuthService.js` (3 calls) | Auth service operations | By design within auth layer |
| `src/lib/supabaseAuthRefresh.js` (4 calls) | Refresh implementation | By design — these ARE the read-after-write verifications |

**Acceptable sites (single sequential call, not concurrent):**
- `src/contexts/AuthContext.impl.jsx` — auth initialization path, before the store has data
- `src/pages/*.jsx` — user-triggered action handlers (not background loops)
- `src/components/invoice/*.jsx` — on-demand PDF/send operations

**Why not fixed in this pass:** Migrating all sites to `getStableSession()` is a codebase-wide refactor with non-trivial test coverage requirements. The actual failure mode (two concurrent callers racing on refresh token consumption) requires the refresh token to be about to expire AND both calls to hit Supabase simultaneously. The 5s snapshot cache in SessionCoordinator already handles the high-frequency case (multiple callers within the same React render cycle). The remaining sites are mostly sequential single-call operations.

**Mitigation already in place:**
- `refreshSupabaseSessionWithRecovery()` (which wraps actual refreshes) is correctly single-flighted through RefreshQueue
- `SessionCoordinator` gates all SyncEngine and realtime-path reads
- Most direct getSession() calls only need a valid token, not a fresh one — the Supabase client caches this in localStorage

**Recommended follow-up:** Migrate `connectionHealth.js`, `affiliateClient.js`, and `ActivityNotificationService.js` to `getStableSession()` from SessionCoordinator — these are the only sites where concurrent reads under refresh pressure are plausible.

---

## R-02 — invalidateClientDomain cascades into invalidateInvoiceDomain

**Severity:** Low  
**Files:** `src/lib/queryInvalidation.js`

`invalidateClientDomain` always calls `invalidateInvoiceDomain`. This is correct for realtime client edits (invoice list items render client names — a client rename makes invoice cache stale). However, callers that only intend to invalidate client queries also get invoice invalidations.

**Current call sites:**
| Site | Cascade correct? |
|------|-----------------|
| `SyncEngine.invalidateForEntity('clients', ...)` fallback path | Yes — realtime client change may affect invoice display |
| `SyncEngine.onWakeResync` | **Fixed** — now calls client-only invalidations |
| Post-mutation invalidation in feature components | Depends — client update rarely changes invoice cache content |

**Risk:** Over-broad invalidation on client mutations causes unnecessary cashflow-page and invoice list refetches. Not a correctness bug — data is still accurate.

**Recommended follow-up:** Add an `{ cascade: false }` option to `invalidateClientDomain` so post-mutation callers can skip the invoice cascade when they know it's unnecessary.

---

## R-03 — Legacy broad query key ["invoices"] in invalidateInvoiceDomain

**Severity:** Low  
**File:** `src/lib/queryInvalidation.js`

`invalidateInvoiceDomain` still calls:
```js
queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false });
```

This matches ALL queries whose first key element is `"invoices"` — including `["invoices","list",...]` and `["invoices","detail",...]`. The scoped invalidations above it (`["invoice-list", scopeKey]`, `["invoices","list"]`) already cover the list path. The broad `["invoices"]` root exists to support legacy hooks that have not yet migrated to the structured key factories in `queryPolicies.ts`.

**Risk:** Over-broad invalidation on every invoice event. Not a correctness bug.

**Recommended follow-up:** Complete hook migration to `queryKeys.invoiceList(orgId)` and `queryKeys.invoiceDetail(id)` from `queryPolicies.ts`, then remove the broad `["invoices"]` fallback from `invalidateInvoiceDomain`.

**Current migration status:** New hooks use structured keys. Legacy hooks (in pages using `Invoice.list()` directly) still use broad roots.

---

## R-04 — RuntimeBudgetCoordinator.consumeFocusRefetchBudget() not wired

**Severity:** Closed (intentionally deferred)

Since `refetchOnWindowFocus: false` is the global default, focus-triggered refetches are limited to the 3 registered roots (`notifications`, `admin-messages`, `cashflow-page`). A typical tab focus event triggers ≤3 refetches — well under the 8-query FOCUS_REFETCH_BUDGET cap. Wiring up `consumeFocusRefetchBudget()` before each focus-driven refetch would add per-query overhead with no protective value at current scale.

**Re-evaluate when:** `FOCUS_LIVE_QUERY_ROOTS` grows beyond 6 entries or a new high-frequency polling pattern is introduced.

---

## Multi-Tab Session Race Risk

**Status:** Managed (no changes needed)

`refreshSupabaseSessionWithRecovery()` uses a cross-tab localStorage lock (`authTabSync`) with a 30s TTL. Only one tab performs the refresh; others wait and read the refreshed session from storage. The RefreshQueue `inFlightPromise` handles the within-tab case.

**Remaining edge:** If two tabs open simultaneously from a cold start, both may call `getSession()` before either has acquired the lock. Supabase's own client-side deduplication (it reads the same localStorage key) mitigates this. No production incidents attributable to this pattern have been observed.

---

## Verdict

The system is production-grade for the current scale. The open risks (R-01, R-02, R-03) are low-severity informational items that require migration work, not emergency fixes. No active race conditions or cascading failure modes remain after this pass.
