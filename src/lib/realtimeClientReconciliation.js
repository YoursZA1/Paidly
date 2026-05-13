/**
 * Patch TanStack Query + Zustand from `clients` postgres_changes instead of invalidating
 * all client/invoice queries and running a global `fetchAll`.
 */
import { paidlyDataLayerLog } from "@/lib/paidlyDataLayerInstrumentation";

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ upsertFromRemote: (row: object) => void, removeFromRemote: (id: string) => void }} store
 * @param {{ eventType?: string, new?: object | null, old?: object | null }} payload
 * @returns {boolean} true when caches were reconciled (caller may skip global fetchAll).
 */
export function reconcileClientRealtimeEvent(queryClient, store, payload) {
  const eventType = String(payload?.eventType || "").toLowerCase();

  if (eventType === "delete") {
    const id = payload?.old?.id;
    if (!id) return false;
    store.removeFromRemote(id);
    patchClientsInfiniteQueries(queryClient, { mode: "delete", id });
    queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
    paidlyDataLayerLog("realtime_patch_clients", { eventType, id });
    return true;
  }

  if (eventType === "insert" || eventType === "update") {
    const row = payload?.new;
    if (!row || typeof row !== "object" || !row.id) return false;
    store.upsertFromRemote(row);
    patchClientsInfiniteQueries(queryClient, { mode: "upsert", row, insert: eventType === "insert" });
    queryClient.invalidateQueries({ queryKey: ["cashflow-page"], exact: false });
    paidlyDataLayerLog("realtime_patch_clients", { eventType, id: row.id });
    return true;
  }

  return false;
}

/**
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {{ mode: "upsert" | "delete", row?: object, id?: string, insert?: boolean }} op
 */
function patchClientsInfiniteQueries(queryClient, op) {
  queryClient.setQueriesData(
    {
      predicate: (q) => {
        const k = q.queryKey;
        return Array.isArray(k) && k[0] === "clients" && k[1] === "list";
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
