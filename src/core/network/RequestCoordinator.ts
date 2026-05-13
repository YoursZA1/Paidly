import { getRuntimeCoordinatorSnapshot } from "@/core/runtime/RuntimeCoordinator";

const sleep = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

/**
 * Bounded retries with exponential backoff + jitter (for fetch/Axios helpers).
 * Prefer small `maxAttempts` for mutations.
 */
export async function retryWithBudget<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    isRetryable: (error: unknown) => boolean;
    baseDelayMs?: number;
  }
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts);
  const base = options.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!options.isRetryable(e) || attempt === maxAttempts - 1) {
        throw e;
      }
      const jitter = Math.floor(Math.random() * 200);
      await sleep(base * 2 ** attempt + jitter);
    }
  }
  throw lastErr;
}

/**
 * Limits concurrent in-flight HTTP-style work and dedupes identical keys.
 */
export class RequestCoordinator {
  private readonly maxConcurrent: number;
  private active = 0;
  private readonly waitQueue: Array<() => void> = [];
  private readonly inflightDedupe = new Map<string, Promise<unknown>>();

  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
  }

  shouldPause(): boolean {
    return getRuntimeCoordinatorSnapshot().pauseNonCriticalRequests;
  }

  async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    while (getRuntimeCoordinatorSnapshot().pauseNonCriticalRequests) {
      await new Promise((r) => globalThis.setTimeout(r, 100));
    }
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  async dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflightDedupe.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const p = this.withSlot(fn).finally(() => {
      if (this.inflightDedupe.get(key) === p) this.inflightDedupe.delete(key);
    });
    this.inflightDedupe.set(key, p);
    return p;
  }
}
