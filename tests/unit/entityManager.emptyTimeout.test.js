import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(),
  },
  isSupabaseConfigured: true,
}));

vi.mock("@/stores/sessionHealthStore", () => {
  const SESSION_STATUS = { EXPIRED: "expired", OK: "ok" };
  return {
    SESSION_STATUS,
    useSessionHealthStore: {
      getState: () => ({ status: SESSION_STATUS.OK }),
    },
  };
});

vi.mock("@/lib/runtimeMutationGuard", () => ({
  assertRuntimeAllowsMutations: vi.fn(),
}));

describe("EntityManager list empty-timeout default", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", { onLine: true });
  });

  it(
    "throws EntityListTimeoutError when skipLocalPersistence cache stays empty past maxWaitMs",
    async () => {
      const { EntityManager } = await import("@/api/entity/EntityManager.js");
      const manager = new EntityManager("Client", "11111111-1111-4111-8111-111111111111");
      expect(manager.skipLocalPersistence).toBe(true);

      manager.pullFromSupabase = vi.fn(
        () => new Promise(() => {}) // never resolves
      );

      await expect(
        manager.list("-created_date", { limit: 10, maxWaitMs: 40 })
      ).rejects.toMatchObject({ name: "EntityListTimeoutError" });
    },
    15_000
  );

  it(
    "allows opt-out via errorOnEmptyTimeout: false",
    async () => {
      const { EntityManager } = await import("@/api/entity/EntityManager.js");
      const manager = new EntityManager("Client", "11111111-1111-4111-8111-111111111111");
      manager.pullFromSupabase = vi.fn(() => new Promise(() => {}));

      const rows = await manager.list("-created_date", {
        limit: 10,
        maxWaitMs: 40,
        errorOnEmptyTimeout: false,
      });
      expect(rows).toEqual([]);
    },
    15_000
  );
});
