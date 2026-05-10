import { describe, expect, it } from "vitest";
import { createRefreshQueue } from "@/lib/session/RefreshQueue";
import { refreshRetrying, refreshSkipped, refreshSuccess } from "@/lib/session/refreshResult";

describe("RefreshQueue RefreshResult", () => {
  it("returns skipped when throttled", async () => {
    const q = createRefreshQueue({ minGapMs: 60_000 });
    const first = await q.enqueue(async () => refreshSuccess(), { source: "t1" });
    const second = await q.enqueue(async () => refreshSuccess(), { source: "t2" });
    expect(first.status).toBe("success");
    expect(second.status).toBe("skipped");
    expect(second.reason).toBe("throttled");
  });

  it("returns skipped when halted", async () => {
    const q = createRefreshQueue({ minGapMs: 0 });
    q.halt();
    const out = await q.enqueue(async () => refreshSuccess(), { source: "halted" });
    expect(out).toEqual(refreshSkipped("queue_halted"));
  });

  it("runs immediately when bypassThrottle despite minGap", async () => {
    const q = createRefreshQueue({ minGapMs: 60_000 });
    const first = await q.enqueue(async () => refreshSuccess(), { source: "t1" });
    const second = await q.enqueue(async () => refreshSuccess(), {
      source: "wake",
      bypassThrottle: true,
    });
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
  });

  it("returns retrying when join in flight and returnRetryingOnJoin", async () => {
    const q = createRefreshQueue({ minGapMs: 0 });
    let resolveFirst;
    const firstPromise = q.enqueue(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      { source: "first" }
    );
    const second = await q.enqueue(async () => refreshSuccess(), {
      source: "second",
      returnRetryingOnJoin: true,
    });
    expect(second).toEqual(refreshRetrying("joined_in_flight"));
    resolveFirst(refreshSuccess());
    await firstPromise;
  });

  it("joins in-flight promise by default (no returnRetryingOnJoin)", async () => {
    const q = createRefreshQueue({ minGapMs: 0 });
    let resolveFirst;
    const firstPromise = q.enqueue(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      { source: "first" }
    );
    const secondPromise = q.enqueue(async () => refreshSuccess(), { source: "second" });
    resolveFirst(refreshSuccess());
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
  });
});
