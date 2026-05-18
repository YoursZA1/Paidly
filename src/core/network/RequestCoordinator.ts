import { getRuntimeCoordinatorSnapshot, useRuntimeCoordinator } from "@/core/runtime/RuntimeCoordinator";

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

  /** Block until RuntimeCoordinator allows non-critical HTTP (or maxWaitMs elapses). */
  async waitUntilUnpaused(maxWaitMs = 120_000): Promise<void> {
    if (!getRuntimeCoordinatorSnapshot().pauseNonCriticalRequests) return;
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        unsub();
        resolve();
      };
      const timeoutId = globalThis.setTimeout(finish, maxWaitMs);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const unsub = (useRuntimeCoordinator as any).subscribe(
        (state: { pauseNonCriticalRequests: boolean }) => { if (!state.pauseNonCriticalRequests) finish(); }
      );
    });
  }

  async acquireSlot(): Promise<void> {
    while (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }
    this.active += 1;
  }

  releaseSlot(): void {
    if (this.active > 0) this.active -= 1;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitUntilUnpaused();
    await this.acquireSlot();
    try {
      return await fn();
    } finally {
      this.releaseSlot();
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
