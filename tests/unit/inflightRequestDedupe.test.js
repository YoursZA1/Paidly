import { describe, it, expect, beforeEach, vi } from "vitest";
import { runDedupedAsync, __resetInflightDedupeForTests } from "@/lib/inflightRequestDedupe";

describe("inflightRequestDedupe", () => {
  beforeEach(() => {
    __resetInflightDedupeForTests();
  });

  it("shares one promise for concurrent same-key calls", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    const a = runDedupedAsync("k1", fn);
    const b = runDedupedAsync("k1", fn);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe(42);
    expect(rb).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs again after the first settles", async () => {
    const fn = vi.fn(async () => 1);
    await runDedupedAsync("k2", fn);
    await runDedupedAsync("k2", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
