import { describe, expect, it } from "vitest";
import { resolveListPageBounds } from "@/api/entity/entityShared";

describe("resolveListPageBounds", () => {
  it("allows omitted limit with default offset", () => {
    expect(resolveListPageBounds(undefined, 0)).toEqual({
      ok: true,
      limit: undefined,
      offset: 0,
    });
  });

  it("accepts integer limit and offset", () => {
    expect(resolveListPageBounds(20, 40)).toEqual({ ok: true, limit: 20, offset: 40 });
    expect(resolveListPageBounds("20", "0")).toEqual({ ok: true, limit: 20, offset: 0 });
  });

  it("rejects fractional limit instead of skipping pagination", () => {
    const result = resolveListPageBounds(1.25, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/limit/i);
  });

  it("rejects fractional offset", () => {
    const result = resolveListPageBounds(20, 1.25);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/offset/i);
  });

  it("rejects zero or negative limit", () => {
    expect(resolveListPageBounds(0, 0).ok).toBe(false);
    expect(resolveListPageBounds(-5, 0).ok).toBe(false);
  });
});
