/**
 * Smart realtime reconciliation: patch TanStack Query + app store from postgres_changes payloads
 * instead of invalidating entire trees or calling fetchAll() on every row event.
 */
import { paidlyDataLayerLog } from "@/lib/paidlyDataLayerInstrumentation";

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ upsertFromRemote: (row: object) => void, removeFromRemote: (id: string) => void }} store
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean} true when local caches were reconciled (caller may skip global fetchAll).
 */
export function reconcileInvoiceRealtimeEvent(queryClient, store, payload) {
  const eventType = String(payload?.eventType || "").toLowerCase();

  if (eventType === "delete") {
    const id = payload?.old?.id;
    if (!id) return false;
    store.removeFromRemote(id);
    patchInvoicesListQuery(queryClient, { mode: "delete", id });
    patchInvoicesInfiniteListQueries(queryClient, { mode: "delete", id });
    patchInvoiceDetailQueries(queryClient, id, null);
    queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
    paidlyDataLayerLog("realtime_patch_invoices", { eventType, id });
    return true;
  }

  if (eventType === "insert" || eventType === "update") {
    const row = payload?.new;
    if (!row || typeof row !== "object" || !row.id) return false;
    store.upsertFromRemote(row);
    patchInvoicesListQuery(queryClient, { mode: "upsert", row });
    patchInvoicesInfiniteListQueries(queryClient, { mode: "upsert", row, insert: eventType === "insert" });
    patchInvoiceDetailQueries(queryClient, row.id, row);
    queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
    paidlyDataLayerLog("realtime_patch_invoices", { eventType, id: row.id });
    return true;
  }

  return false;
}

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ mode: "upsert" | "delete", row?: object, id?: string, insert?: boolean }} op
 */
function patchInvoicesListQuery(queryClient, op) {
  queryClient.setQueryData(["invoices"], (prev) => {
    if (!prev || typeof prev !== "object" || !Array.isArray(prev.invoices)) return prev;
    if (op.mode === "delete" && op.id) {
      return {
        ...prev,
        invoices: prev.invoices.filter((inv) => inv.id !== op.id),
      };
    }
    if (op.mode === "upsert" && op.row) {
      const id = op.row.id;
      const idx = prev.invoices.findIndex((inv) => inv.id === id);
      let nextInvoices;
      if (idx === -1) {
        nextInvoices = op.insert ? [op.row, ...prev.invoices] : [...prev.invoices];
      } else {
        nextInvoices = [...prev.invoices];
        nextInvoices[idx] = { ...nextInvoices[idx], ...op.row };
      }
      return { ...prev, invoices: nextInvoices };
    }
    return prev;
  });
}

function patchInvoicesInfiniteListQueries(queryClient, op) {
  queryClient.setQueriesData(
    {
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === "invoices" && k[1] === "list";
      },
    },
    (old) => {
      if (!old || !Array.isArray(old.pages)) return old;
      if (op.mode === "delete" && op.id) {
        const pages = old.pages.map((page) =>
          Array.isArray(page) ? page.filter((r) => r && r.id !== op.id) : page
        );
        return { ...old, pages };
      }
      if (op.mode === "upsert" && op.row) {
        const id = op.row.id;
        let found = false;
        const pages = old.pages.map((page) => {
          if (!Array.isArray(page)) return page;
          const idx = page.findIndex((r) => r && r.id === id);
          if (idx === -1) return page;
          found = true;
          const next = [...page];
          next[idx] = { ...next[idx], ...op.row };
          return next;
        });
        if (!found && op.insert && old.pages.length && Array.isArray(old.pages[0])) {
          const p0 = [op.row, ...old.pages[0]];
          return { ...old, pages: [p0, ...old.pages.slice(1)] };
        }
        return { ...old, pages };
      }
      return old;
    }
  );
}

function patchInvoiceDetailQueries(queryClient, invoiceId, rowOrNull) {
  if (rowOrNull == null) {
    queryClient.removeQueries({
      predicate: (q) => {
        const k = q.queryKey;
        if (!Array.isArray(k)) return false;
        if (k[0] === "invoice" && k[1] === invoiceId) return true;
        if (k[0] === "invoices" && k[1] === "detail" && k[2] === invoiceId) return true;
        return false;
      },
    });
    return;
  }
  queryClient.setQueriesData(
    {
      predicate: (q) => {
        const k = q.queryKey;
        if (!Array.isArray(k)) return false;
        if (k[0] === "invoice" && k[1] === invoiceId) return true;
        if (k[0] === "invoices" && k[1] === "detail" && k[2] === invoiceId) return true;
        return false;
      },
    },
    (prev) => {
      if (prev && typeof prev === "object") {
        return { ...prev, ...rowOrNull };
      }
      return rowOrNull;
    }
  );
}
