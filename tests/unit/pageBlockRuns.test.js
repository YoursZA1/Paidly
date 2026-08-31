import { describe, expect, it } from "vitest";
import { createBlock } from "@/lib/documentPdf/blocks";
import { pageBlockRuns } from "@/lib/documentPdf/pageBlockRuns";

describe("pageBlockRuns", () => {
  it("groups consecutive line items into one table run", () => {
    const runs = pageBlockRuns([
      createBlock({ id: "line:0", kind: "line-item", heightPx: 10, meta: { rowIndex: 0 } }),
      createBlock({ id: "line:1", kind: "line-item", heightPx: 10, meta: { rowIndex: 1 } }),
      createBlock({ id: "totals", kind: "totals-payment", heightPx: 40 }),
      createBlock({
        id: "terms:0",
        kind: "terms-part",
        heightPx: 10,
        policy: "flow-part",
        flowGroup: "terms",
        meta: { termsIndex: 0 },
      }),
      createBlock({
        id: "terms:1",
        kind: "terms-part",
        heightPx: 10,
        policy: "flow-part",
        flowGroup: "terms",
        meta: { termsIndex: 1 },
      }),
    ]);
    expect(runs.map((r) => r.type)).toEqual(["table", "block", "flow"]);
    expect(runs[0].blocks).toHaveLength(2);
    expect(runs[1].block.kind).toBe("totals-payment");
    expect(runs[2].group).toBe("terms");
    expect(runs[2].blocks).toHaveLength(2);
  });
});
