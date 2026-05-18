# Paidly — Realtime Reconciliation Strategy

> Updated: 2026-05-18

---

## Principle

Prefer surgical cache patches over broad invalidations or full store reloads. A realtime `postgres_changes` event carries the changed row — use it to update only the affected entries rather than re-fetching entire datasets.

---

## Reconciler Inventory

| Entity | File | Behavior |
|--------|------|---------|
| `invoices` | `realtimeInvoiceReconciliation.js` | Patches list + infinite list + detail; invalidates cashflow |
| `clients` | `realtimeClientReconciliation.js` | Patches infinite list; invalidates cashflow |
| `quotes` | `realtimeEntityReconciliation.js` | Patches infinite list + legacy flat list; invalidates cashflow |
| `payments` | `realtimeEntityReconciliation.js` | Patches affected invoice detail; invalidates invoice list + cashflow |
| `expenses` | `realtimeEntityReconciliation.js` | Invalidates cashflow only (no list to patch) |
| `payslips` | `realtimeEntityReconciliation.js` | Patches flat list; falls back to targeted invalidation |
| `document_sends` | `SyncEngine.jsx` (inline) | Invalidates `["admin-messages"]` |

All reconcilers return `true` when the patch succeeded, signaling `SyncEngine.scheduleEntityInvalidation` to skip `scheduleGlobalStoreRefresh`.

---

## The `fetchAllFromStore` Fallback Is Gone

Prior behavior:
```
realtime event → invalidateForEntity() returns false → scheduleGlobalStoreRefresh() → fetchAllFromStore(user)
```

`fetchAllFromStore` was a full data reload — it fetched every invoice, client, quote, and payment from scratch. This ran on every `quotes`, `payments`, `expenses`, `payslips`, and `document_sends` change.

Current behavior:
```
realtime event → reconciler patches cache surgically → returns true → no fetchAll
```

`fetchAllFromStore` is no longer called anywhere in the realtime/sync path. The wake recovery handler (`paidly:wake-recovery-resync`) was the last holdout; it now issues the same set of targeted `invalidateQueries` calls as the fallback path. TanStack Query refetches stale data lazily on the next render of the affected component.

---

## Patch Patterns

### Insert / Update

```js
queryClient.setQueriesData(
  { predicate: (q) => q.queryKey[0] === "quotes" && q.queryKey[1] === "list" },
  (old) => {
    if (!old?.pages) return old;
    // For update: find the existing row and merge
    // For insert: prepend to the first page
  }
);
```

### Delete

```js
queryClient.setQueriesData(
  { predicate: (q) => q.queryKey[0] === "quotes" && q.queryKey[1] === "list" },
  (old) => ({ ...old, pages: old.pages.map((p) => p.filter((r) => r.id !== deletedId)) })
);
```

### Payment → Invoice relationship

Payments don't have their own list in the UI, but they update invoice `status` fields. The payment reconciler patches the related invoice detail cache entry and invalidates the invoice list for the affected scope. The `invoice_id` field on the payment payload drives this.

---

## Reconciler Return Contract

`reconcileXxxRealtimeEvent()` → `boolean`

- `true` = cache updated surgically; caller MUST NOT call `fetchAll`
- `false` = could not patch (missing payload fields, unexpected shape); caller MAY fall back to invalidation

In practice, all reconcilers currently return `true` as a final fallback (targeted invalidation is always better than fetchAll).

---

## Adding a New Entity

1. Create a reconciler in `realtimeEntityReconciliation.js` (or a dedicated file for complex entities)
2. Return `true` from all code paths
3. Register in `SyncEngine.invalidateForEntity`:
   ```js
   if (entity === "your_table") {
     return reconcileYourTableEvent(queryClient, payload || {});
   }
   ```
4. Add the table to `PAIDLY_REALTIME_SYNC_TABLES` in `paidlyRealtimeManager.js`
5. Add an entity debounce entry in `SyncEngine.realtimeEntityDebounceRefs`

---

## Query Key Shapes (Canonical)

| Entity | Keys patched |
|--------|-------------|
| invoices | `["invoices"]`, `["invoice-list", scopeKey]`, `["invoices", "list"]`, `["invoice", id]`, `["invoices","detail",id]` |
| clients | `["clients","list"]`, `["client-list", scopeKey]` |
| quotes | `["quotes","list",userId]`, `["quotes"]` (legacy) |
| payments | `["invoice", invoiceId]`, `["invoice-list", scopeKey]`, `["cashflow-page"]` |
| expenses | `["cashflow-page"]` |
| payslips | `["payslips"]` |
