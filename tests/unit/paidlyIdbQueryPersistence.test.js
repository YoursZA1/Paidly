/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { hydrateQueryClientFromIdb, saveReactQuerySnapshotsToIdb } from "@/lib/paidlyIdbQueryPersistence";
import { __resetPaidlyIdbCacheForTests } from "@/lib/paidlyIdbKvCache";

describe("paidlyIdbQueryPersistence", () => {
  beforeEach(async () => {
    await __resetPaidlyIdbCacheForTests();
  });

  it("round-trips a whitelisted query snapshot", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = ["invoices", "org-1"];
    await saveReactQuerySnapshotsToIdb([
      { queryKey, data: [{ id: "inv-1" }], updatedAt: 1_700_000_000_000 },
    ]);
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await hydrateQueryClientFromIdb(qc2);
    expect(qc2.getQueryData(queryKey)).toEqual([{ id: "inv-1" }]);
  });

  it("does not persist disallowed query roots", async () => {
    const queryKey = ["secrets", "x"];
    await saveReactQuerySnapshotsToIdb([{ queryKey, data: { bad: true }, updatedAt: 1 }]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await hydrateQueryClientFromIdb(qc);
    expect(qc.getQueryData(queryKey)).toBeUndefined();
  });
});
