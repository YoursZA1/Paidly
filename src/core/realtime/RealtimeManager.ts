/**
 * Central subscription registry for Supabase Realtime **logical** consumers.
 * Transport/channel lifecycle stays in `paidlyRealtimeManager.js` — this class
 * tracks named logical families (budget + pause) so cores/docs stay honest.
 */

export type SubscriptionHandle = {
  id: string;
  dispose: () => void;
};

export type RealtimeBudget = {
  /** Max logical subscriptions (table families) per tab */
  maxLogicalSubscriptions: number;
};

const defaultBudget: RealtimeBudget = {
  maxLogicalSubscriptions: 12,
};

export class RealtimeManager {
  private readonly budget: RealtimeBudget;
  private readonly handles = new Map<string, SubscriptionHandle>();
  private paused = false;

  constructor(budget: Partial<RealtimeBudget> = {}) {
    this.budget = { ...defaultBudget, ...budget };
  }

  register(name: string, subscribe: () => () => void): SubscriptionHandle | null {
    if (this.paused) return null;
    if (this.handles.size >= this.budget.maxLogicalSubscriptions && !this.handles.has(name)) {
      console.warn(`[RealtimeManager] budget exceeded (${this.budget.maxLogicalSubscriptions}), skipping: ${name}`);
      return null;
    }
    this.unregister(name);
    const dispose = subscribe();
    const handle: SubscriptionHandle = {
      id: name,
      dispose: () => {
        try {
          dispose();
        } catch {
          /* ignore */
        }
        this.handles.delete(name);
      },
    };
    this.handles.set(name, handle);
    return handle;
  }

  /**
   * Track a logical family without owning channel lifecycle (used by paidlyRealtimeManager).
   * @returns false if paused or over budget (name already tracked still returns true)
   */
  trackLogical(name: string): boolean {
    if (this.handles.has(name)) return true;
    if (this.paused) return false;
    if (this.handles.size >= this.budget.maxLogicalSubscriptions) {
      console.warn(`[RealtimeManager] budget exceeded (${this.budget.maxLogicalSubscriptions}), skipping: ${name}`);
      return false;
    }
    this.handles.set(name, {
      id: name,
      dispose: () => {
        this.handles.delete(name);
      },
    });
    return true;
  }

  untrackLogical(name: string) {
    this.unregister(name);
  }

  unregister(name: string) {
    const h = this.handles.get(name);
    if (h) h.dispose();
  }

  /** Soft pause — blocks new trackLogical/register; does not tear down transport. */
  setPaused(paused: boolean) {
    this.paused = Boolean(paused);
  }

  pauseAll() {
    this.paused = true;
    for (const h of this.handles.values()) {
      try {
        h.dispose();
      } catch {
        /* ignore */
      }
    }
    this.handles.clear();
  }

  resumeAll() {
    this.paused = false;
  }

  isPaused() {
    return this.paused;
  }

  activeCount() {
    return this.handles.size;
  }

  /** @internal tests */
  activeNames() {
    return [...this.handles.keys()];
  }
}
