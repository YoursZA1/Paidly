/**
 * EntityManager.list for the list pages (Clients, Quotes, Invoices use maxWaitMs + errorOnEmptyTimeout):
 *
 *   pull succeeded, 0 rows   → []            (empty state — NOT "Could not load …")
 *   pull succeeded, rows     → rows
 *   pull failed              → EntityListLoadError (real error state)
 *   pull still running       → EntityListTimeoutError after maxWaitMs (unchanged)
 *
 * Regression: a new personal business with zero records got "Timed out loading Quote after 60000ms"
 * immediately, because an empty cache after a FINISHED pull was treated as a timeout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = { response: { data: [], error: null } };

vi.mock("@/lib/supabaseClient", () => {
  const builder = () => {
    const b = {
      select: () => b,
      eq: () => b,
      or: () => b,
      is: () => b,
      order: () => b,
      range: () => b,
      then: (resolve, reject) => Promise.resolve(db.response).then(resolve, reject),
    };
    return b;
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })),
        getSession: vi.fn(async () => ({ data: { session: { user: { id: USER } } }, error: null })),
      },
      from: vi.fn(() => builder()),
    },
    isSupabaseConfigured: true,
  };
});
vi.mock("@/api/auth/authSessionHelpers.js", () => ({
  getSessionWithRetry: async () => ({ data: { session: { user: { id: USER }, access_token: "t" } } }),
  getAuthUserIdForWrites: async () => USER,
  getSessionDataForProfileWrite: async () => ({}),
  isSupabaseAuthUuid: () => true,
}));
vi.mock("@/services/CompanyContextService", () => ({ loadCompanyAccessContext: async () => null }));
vi.mock("@/stores/sessionHealthStore", () => {
  const SESSION_STATUS = { EXPIRED: "expired", OK: "ok" };
  return { SESSION_STATUS, useSessionHealthStore: { getState: () => ({ status: SESSION_STATUS.OK }) } };
});
vi.mock("@/lib/runtimeMutationGuard", () => ({ assertRuntimeAllowsMutations: vi.fn() }));

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const LIST_PAGE_OPTS = { limit: 40, offset: 0, maxWaitMs: 60_000 }; // what useQuotes/useClientsList send

async function manager(entity = "Quote") {
  const { EntityManager } = await import("@/api/entity/EntityManager.js");
  const m = new EntityManager(entity, USER);
  m.ensureUserHasOrganization = vi.fn(async () => ORG);
  return m;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("navigator", { onLine: true });
  db.response = { data: [], error: null };
});

describe("list pages: empty vs error vs data", () => {
  for (const entity of ["Quote", "Client", "Invoice"]) {
    it(`${entity}: zero records + successful request → [] immediately (empty state)`, async () => {
      const m = await manager(entity);
      const started = Date.now();
      await expect(m.list("-created_date", LIST_PAGE_OPTS)).resolves.toEqual([]);
      expect(Date.now() - started).toBeLessThan(5_000); // did not wait for maxWaitMs
    });
  }

  it("records + successful request → records render", async () => {
    db.response = {
      data: [
        { id: "q1", quote_number: "Q-1", created_at: "2026-10-01T00:00:00Z" },
        { id: "q2", quote_number: "Q-2", created_at: "2026-10-02T00:00:00Z" },
      ],
      error: null,
    };
    const m = await manager("Quote");
    const rows = await m.list("-created_date", LIST_PAGE_OPTS);
    expect(rows.map((r) => r.id)).toEqual(["q2", "q1"]);
  });

  it("a null payload with no error is still a successful empty list", async () => {
    db.response = { data: null, error: null };
    const m = await manager("Quote");
    await expect(m.list("-created_date", LIST_PAGE_OPTS)).resolves.toEqual([]);
  });

  it("an empty table's range response (PGRST103) is an empty list, not a load error", async () => {
    db.response = {
      data: null,
      error: { code: "PGRST103", message: "Requested range not satisfiable", status: 416 },
    };
    const m = await manager("Client");
    await expect(m.list("-created_date", LIST_PAGE_OPTS)).resolves.toEqual([]);
  });

  it("request/database failure → real error (never an empty state)", async () => {
    db.response = { data: null, error: { message: "permission denied for table quotes", code: "42501" } };
    const m = await manager("Quote");
    await expect(m.list("-created_date", LIST_PAGE_OPTS)).rejects.toMatchObject({
      name: "EntityListLoadError",
      message: expect.stringMatching(/permission denied/i),
    });
  });

  it("business context cannot be resolved → real error", async () => {
    const m = await manager("Client");
    m.ensureUserHasOrganization = vi.fn(async () => {
      throw new Error("You don't have access to this employee portal.");
    });
    await expect(m.list("-created_date", LIST_PAGE_OPTS)).rejects.toMatchObject({ name: "EntityListLoadError" });
  });

  it("callers that opt out (errorOnEmptyTimeout: false) still get [] on failure", async () => {
    db.response = { data: null, error: { message: "boom", code: "500" } };
    const m = await manager("Quote");
    await expect(m.list("-created_date", { ...LIST_PAGE_OPTS, errorOnEmptyTimeout: false })).resolves.toEqual([]);
  });

  it("a pull that is still running past maxWaitMs is still a timeout", async () => {
    const m = await manager("Quote");
    m.pullFromSupabase = vi.fn(() => new Promise(() => {}));
    await expect(m.list("-created_date", { ...LIST_PAGE_OPTS, maxWaitMs: 30 })).rejects.toMatchObject({
      name: "EntityListTimeoutError",
    });
  });
});
