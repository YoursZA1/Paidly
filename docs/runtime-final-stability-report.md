# Paidly — Runtime Final Stability Report

> Updated: 2026-05-18

---

## Status: STABLE

All critical reconnect storms, request floods, and data-consistency races from the prior audit have been resolved. This document records the final state after both the major stabilization pass and the follow-up hardening pass.

---

## Changes Delivered in This Session

### Code Fix — Cashflow Invalidation Coalescing

**Files changed:**
- `src/lib/realtimeInvoiceReconciliation.js`
- `src/lib/realtimeClientReconciliation.js`
- `src/lib/realtimeEntityReconciliation.js`

**Problem:** All 8 `queryClient.invalidateQueries({ queryKey: ["cashflow-page"] })` calls across four reconciler files were direct, uncoalesced calls. A realtime burst of mixed entity events (e.g., 3 invoice inserts + 2 quote updates + 1 payment + 1 expense in quick succession) triggered 8 simultaneous cashflow refetches instead of one.

**Fix:** Replaced all 8 direct calls with `scheduleInvalidation(queryClient, ["cashflow-page"])` from `RuntimeBudgetCoordinator`. The 300ms coalesce window collapses any burst into a single refetch per event cycle.

**Before:**
```
invoice event → cashflow invalidated immediately
quote event   → cashflow invalidated immediately (again)
payment event → cashflow invalidated immediately (again)
expense event → cashflow invalidated immediately (again)
Result: 4 parallel cashflow refetches, N in-flight requests
```

**After:**
```
invoice event → scheduleInvalidation() arms 300ms timer
quote event   → scheduleInvalidation() sees pending timer, no-ops
payment event → scheduleInvalidation() sees pending timer, no-ops
expense event → scheduleInvalidation() sees pending timer, no-ops
300ms elapses → one cashflow invalidation fires
Result: 1 cashflow refetch per burst window
```

---

## Cumulative Fixes Across Both Sessions

### Session 1 — Core Architecture Stabilization

| Fix | Root Cause | File |
|-----|-----------|------|
| `SessionCoordinator` introduced | 5 raw `getSession()` calls in SyncEngine caused concurrent Supabase reads | `src/core/auth/SessionCoordinator.ts` |
| `QueryFocusPolicy` + global `refetchOnWindowFocus: false` | Every stale query refetched simultaneously on tab focus | `src/core/query/queryFocusPolicy.ts`, `src/lib/query-client.js` |
| `RuntimeBudgetCoordinator` created | No shared burst suppression for invalidations or reconnects | `src/core/runtime/RuntimeBudgetCoordinator.ts` |
| Patch-first reconcilers for quotes/payments/expenses/payslips | Every non-invoice entity event fell back to `fetchAllFromStore()` | `src/lib/realtimeEntityReconciliation.js` |
| SyncEngine queue subscription removed | `runOnce` re-created on every job status change → interval churn | `src/components/sync/SyncEngine.jsx` |
| `whenDocumentVisible` de-polled | 600ms `setInterval` for hidden-tab deferral created parallel polling loops | `src/lib/paidlyRealtimeReconciliationEngine.js` |
| JWT rotation no-rebuild when healthy | Token refresh every ~55m tore down a working WebSocket unnecessarily | `src/lib/realtime/paidlyRealtimeManager.js` |

### Session 2 — Hardening Pass

| Fix | Root Cause | File |
|-----|-----------|------|
| Cashflow invalidation coalescing | 8 uncoalesced direct `invalidateQueries` calls fired in parallel during realtime bursts | All 4 reconciler files |

---

## System Invariants — Verified

1. **Single channel:** All postgres_changes subscriptions on `paidly-sync-realtime`. No second channel created.
2. **Single-flight refresh:** `RefreshQueue.enqueue()` → max 1 concurrent token refresh per tab.
3. **No rebuild on healthy socket:** `isPaidlyRealtimeMainChannelJoined()` guard in `flushJwtRebuild`.
4. **No global reload on entity events:** All reconcilers return `true`; `fetchAllFromStore` only called from wake recovery.
5. **No focus flood:** Global `refetchOnWindowFocus: false`; opt-in only via `FocusRefetch.LIVE`.
6. **Event-driven visibility deferral:** `whenDocumentVisible` uses `visibilitychange` listener (no polling).
7. **Cashflow burst protection:** All cashflow invalidations coalesced through `scheduleInvalidation` (300ms window).
8. **Recovery lockout:** `recoveryLockBlocksRealtimeDelivery()` drops all postgres_changes during `blockMutations = true`.
9. **Sync queue stability:** `runOnce` deps contain no store-reactive arrays.
10. **Session reads cached:** `getStableSession()` three-tier priority: store → 5s snapshot → single-flighted Supabase call.
