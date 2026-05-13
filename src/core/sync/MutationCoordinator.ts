/**
 * Client-side mutation dedupe by `operationId` (e.g. UUID per user action).
 * Pair with server idempotency keys for invoice create.
 */

const DEFAULT_TTL_MS = 5 * 60_000;

type Entry<T> = { promise: Promise<T>; createdAt: number };

export class MutationCoordinator {
  private readonly inflight = new Map<string, Entry<unknown>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  private prune() {
    const t = Date.now();
    for (const [k, v] of this.inflight) {
      if (t - v.createdAt > this.ttlMs) this.inflight.delete(k);
    }
  }

  /**
   * Runs `fn` once per `operationId` while the returned promise is pending.
   */
  async runOnce<T>(operationId: string, fn: () => Promise<T>): Promise<T> {
    this.prune();
    const existing = this.inflight.get(operationId) as Entry<T> | undefined;
    if (existing) return existing.promise;
    const promise = fn().finally(() => {
      const cur = this.inflight.get(operationId);
      if (cur?.promise === promise) this.inflight.delete(operationId);
    });
    this.inflight.set(operationId, { promise, createdAt: Date.now() });
    return promise;
  }

  clear() {
    this.inflight.clear();
  }
}
