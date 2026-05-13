import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { reconcileClientRealtimeEvent } from "@/lib/realtimeClientReconciliation";

describe("reconcileClientRealtimeEvent", () => {
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

  it("patches clients infinite cache on update", () => {
    queryClient.setQueryData(["clients", "list", "u1"], {
      pages: [[{ id: "c1", name: "A" }]],
      pageParams: [0],
    });
    const ok = reconcileClientRealtimeEvent(queryClient, store, {
      eventType: "UPDATE",
      new: { id: "c1", name: "B" },
    });
    expect(ok).toBe(true);
    const data = queryClient.getQueryData(["clients", "list", "u1"]);
    expect(data.pages[0][0].name).toBe("B");
    expect(store.rows[0].name).toBe("B");
  });

  it("removes from infinite cache on delete", () => {
    queryClient.setQueryData(["clients", "list", "u1"], {
      pages: [[{ id: "c1" }, { id: "c2" }]],
      pageParams: [0],
    });
    const ok = reconcileClientRealtimeEvent(queryClient, store, {
      eventType: "DELETE",
      old: { id: "c1" },
    });
    expect(ok).toBe(true);
    expect(queryClient.getQueryData(["clients", "list", "u1"]).pages[0].map((x) => x.id)).toEqual(["c2"]);
  });

  it("returns false when insert payload has no id", () => {
    const ok = reconcileClientRealtimeEvent(queryClient, store, {
      eventType: "INSERT",
      new: {},
    });
    expect(ok).toBe(false);
  });
});
