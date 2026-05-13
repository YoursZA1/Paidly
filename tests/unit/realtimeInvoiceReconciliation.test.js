import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { reconcileInvoiceRealtimeEvent } from "@/lib/realtimeInvoiceReconciliation";

describe("reconcileInvoiceRealtimeEvent", () => {
  let queryClient;
  const store = {
    rows: [],
    upsertFromRemote(row) {
      const idx = this.rows.findIndex((r) => r.id === row.id);
      if (idx === -1) this.rows = [row, ...this.rows];
      else this.rows = this.rows.map((r, i) => (i === idx ? { ...r, ...row } : r));
    },
    removeFromRemote(id) {
      this.rows = this.rows.filter((r) => r.id !== id);
    },
  };

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    store.rows = [];
  });

  it("patches ['invoices'] list cache on update", () => {
    queryClient.setQueryData(["invoices"], {
      invoices: [{ id: "a", status: "draft" }],
      clients: [],
    });
    const ok = reconcileInvoiceRealtimeEvent(
      queryClient,
      store,
      { eventType: "UPDATE", new: { id: "a", status: "sent" } }
    );
    expect(ok).toBe(true);
    expect(queryClient.getQueryData(["invoices"]).invoices[0].status).toBe("sent");
    expect(store.rows[0].status).toBe("sent");
  });

  it("removes from list cache on delete", () => {
    queryClient.setQueryData(["invoices"], {
      invoices: [{ id: "a" }, { id: "b" }],
      clients: [],
    });
    const ok = reconcileInvoiceRealtimeEvent(queryClient, store, {
      eventType: "DELETE",
      old: { id: "a" },
    });
    expect(ok).toBe(true);
    expect(queryClient.getQueryData(["invoices"]).invoices.map((x) => x.id)).toEqual(["b"]);
  });

  it("returns false when insert payload has no id", () => {
    const ok = reconcileInvoiceRealtimeEvent(queryClient, store, {
      eventType: "INSERT",
      new: {},
    });
    expect(ok).toBe(false);
  });
});
