/**
 * Central subscription registry for Supabase Realtime **logical** consumers.
 * Integrate gradually — `paidlyRealtimeManager.js` remains the transport owner until refactored.
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
    if (this.handles.size >= this.budget.maxLogicalSubscriptions) {
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

  unregister(name: string) {
    const h = this.handles.get(name);
    if (h) h.dispose();
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
}
