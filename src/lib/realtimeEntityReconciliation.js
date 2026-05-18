/**
 * Patch-first realtime reconciliation for quotes, payments, expenses, and payslips.
 *
 * Each reconciler patches the TanStack Query cache directly rather than
 * invalidating broad roots or calling fetchAllFromStore(). Returning `true`
 * signals SyncEngine that no global store reload is needed.
 *
 * Pattern mirrors realtimeInvoiceReconciliation.js / realtimeClientReconciliation.js.
 */
import { paidlyDataLayerLog } from "@/lib/paidlyDataLayerInstrumentation";
import { scheduleInvalidation } from "@/core/runtime/RuntimeBudgetCoordinator";

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean}
 */
export function reconcileQuoteRealtimeEvent(queryClient, payload) {
  const eventType = String(payload?.eventType || "").toLowerCase();

  if (eventType === "delete") {
    const id = payload?.old?.id;
    if (!id) return false;
    patchQuoteListQueries(queryClient, { mode: "delete", id });
    scheduleInvalidation(queryClient, ["cashflow-page"]);
    paidlyDataLayerLog("realtime_patch_quotes", { eventType, id });
    return true;
  }

  if (eventType === "insert" || eventType === "update") {
    const row = payload?.new;
    if (!row || typeof row !== "object" || !row.id) return false;
    patchQuoteListQueries(queryClient, { mode: "upsert", row, insert: eventType === "insert" });
    scheduleInvalidation(queryClient, ["cashflow-page"]);
    paidlyDataLayerLog("realtime_patch_quotes", { eventType, id: row.id });
    return true;
  }

  return false;
}

function patchQuoteListQueries(queryClient, op) {
  // Infinite list: ["quotes", "list", userId]
  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "quotes" && q.queryKey[1] === "list" },
    (old) => {
      if (!old || !Array.isArray(old.pages)) return old;
      if (op.mode === "delete" && op.id) {
        return { ...old, pages: old.pages.map((p) => Array.isArray(p) ? p.filter((r) => r?.id !== op.id) : p) };
      }
      if (op.mode === "upsert" && op.row) {
        const id = op.row.id;
        let found = false;
        const pages = old.pages.map((page) => {
          if (!Array.isArray(page)) return page;
          const idx = page.findIndex((r) => r?.id === id);
          if (idx === -1) return page;
          found = true;
          const next = [...page];
          next[idx] = { ...next[idx], ...op.row };
          return next;
        });
        if (!found && op.insert && old.pages.length && Array.isArray(old.pages[0])) {
          return { ...old, pages: [[op.row, ...old.pages[0]], ...old.pages.slice(1)] };
        }
        return { ...old, pages };
      }
      return old;
    }
  );
  // Legacy flat list: ["quotes"]
  queryClient.setQueriesData(
    { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "quotes" && q.queryKey[1] == null },
    (old) => {
      if (!Array.isArray(old)) return old;
      if (op.mode === "delete" && op.id) return old.filter((r) => r?.id !== op.id);
      if (op.mode === "upsert" && op.row) {
        const id = op.row.id;
        const idx = old.findIndex((r) => r?.id === id);
        if (idx === -1) return op.insert ? [op.row, ...old] : old;
        const next = [...old];
        next[idx] = { ...next[idx], ...op.row };
        return next;
      }
      return old;
    }
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * A payment change affects the related invoice's status (paid/unpaid/partial).
 * Patches the invoice cache for the affected invoice_id if present; always
 * invalidates cashflow.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {string | null} scopeKey  — typically the signed-in user id
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean}
 */
export function reconcilePaymentRealtimeEvent(queryClient, scopeKey, payload) {
  const row = payload?.new || payload?.old;
  const invoiceId = row?.invoice_id ?? null;
  const eventType = String(payload?.eventType || "").toLowerCase();

  if (invoiceId) {
    // Patch the affected invoice to reflect new payment state
    queryClient.setQueriesData(
      {
        predicate: (q) => {
          const k = q.queryKey;
          if (!Array.isArray(k)) return false;
          return (k[0] === "invoice" && k[1] === invoiceId) ||
                 (k[0] === "invoices" && k[1] === "detail" && k[2] === invoiceId);
        },
      },
      (prev) => {
        if (!prev || typeof prev !== "object") return prev;
        // Mark the invoice as needing a background refresh (data is stale)
        return { ...prev, _paymentUpdatedAt: Date.now() };
      }
    );
    // Targeted invalidation: only the affected invoice's cache entry + cashflow
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId], exact: false });
    if (scopeKey) {
      queryClient.invalidateQueries({ queryKey: ["invoice-list", scopeKey], exact: false });
    }
  }

  queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
  paidlyDataLayerLog("realtime_patch_payments", { eventType, invoiceId });
  return true;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/**
 * Expenses only affect cashflow aggregates — no entity list to patch.
 * Invalidating just cashflow-page is the correct minimal action.
 *
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean}
 */
export function reconcileExpenseRealtimeEvent(queryClient, payload) {
  const eventType = String(payload?.eventType || "").toLowerCase();
  queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
  paidlyDataLayerLog("realtime_patch_expenses", { eventType });
  return true;
}

// ---------------------------------------------------------------------------
// Payslips
// ---------------------------------------------------------------------------

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean}
 */
export function reconcilePayslipRealtimeEvent(queryClient, payload) {
  const eventType = String(payload?.eventType || "").toLowerCase();
  const row = payload?.new;
  const id = payload?.old?.id || row?.id;

  if (eventType === "delete" && id) {
    queryClient.setQueriesData(
      { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "payslips" },
      (old) => Array.isArray(old) ? old.filter((r) => r?.id !== id) : old
    );
    paidlyDataLayerLog("realtime_patch_payslips", { eventType, id });
    return true;
  }

  if ((eventType === "insert" || eventType === "update") && row?.id) {
    queryClient.setQueriesData(
      { predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "payslips" },
      (old) => {
        if (!Array.isArray(old)) return old;
        const idx = old.findIndex((r) => r?.id === row.id);
        if (idx === -1) return eventType === "insert" ? [row, ...old] : old;
        const next = [...old];
        next[idx] = { ...next[idx], ...row };
        return next;
      }
    );
    paidlyDataLayerLog("realtime_patch_payslips", { eventType, id: row.id });
    return true;
  }

  // Fallback: targeted invalidation is still better than fetchAll
  queryClient.invalidateQueries({ queryKey: ["payslips"], exact: false });
  paidlyDataLayerLog("realtime_patch_payslips", { eventType, fallback: true });
  return true;
}
