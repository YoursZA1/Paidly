/**
 * /api/company/client-import — auth, business isolation, server-side re-validation,
 * duplicate policy, idempotent retries and partial failure. Two companies live in the fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: { from: () => ({}) } }));

const { createClientImportHandler, CLIENT_IMPORT_MESSAGES } = await import("../../server/src/clients/clientImportRoutes.js");
const { UpgradeRequiredError } = await import("../../server/src/featureGate.js");
const { identityKeys } = await import("../../shared/clients/clientImport.js");

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "11111111-1111-4111-8111-111111111111";
const IMPORT = "44444444-4444-4444-8444-444444444444";
const CLIENT_A = "c0000000-0000-4000-8000-00000000000a";
const CLIENT_B = "c0000000-0000-4000-8000-00000000000b";

function mockRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  res.setHeader = (k, v) => (res.headers[k] = v);
  return res;
}

function makeBook() {
  const rows = [
    { id: CLIENT_A, org_id: ORG_A, name: "Thabo Nkosi", email: "thabo@example.co.za", phone: "0825550101", tax_id: "4123456789", notes: "keep me", pos_enabled: false },
    { id: CLIENT_B, org_id: ORG_B, name: "Other Business", email: "thabo@example.co.za", phone: "0825550101", tax_id: "999", notes: "other org" },
  ];
  const runs = [];
  let seq = 0;
  const same = (a, b) => identityKeys(a).email === identityKeys(b).email && identityKeys(b).email
    || identityKeys(a).phone === identityKeys(b).phone && identityKeys(b).phone
    || identityKeys(a).tax === identityKeys(b).tax && identityKeys(b).tax;
  const repo = {
    rows,
    runs,
    findMatches: vi.fn(async (orgId, { emails, phones, taxes }) => {
      const wanted = { email: emails[0] ? new Set(emails) : null, phone: phones[0] ? new Set(phones) : null, tax: taxes[0] ? new Set(taxes) : null };
      return rows.filter((r) => {
        if (r.org_id !== orgId) return false;
        const keys = identityKeys(r);
        return (wanted.email && keys.email && wanted.email.has(keys.email))
          || (wanted.phone && keys.phone && wanted.phone.has(keys.phone))
          || (wanted.tax && keys.tax && wanted.tax.has(keys.tax));
      });
    }),
    findByImportRefs: vi.fn(async (orgId, refs) => rows.filter((r) => r.org_id === orgId && refs.includes(r.import_ref))),
    findByIds: vi.fn(async (orgId, ids) => rows.filter((r) => r.org_id === orgId && ids.includes(r.id))),
    insertRows: vi.fn(async (newRows) => {
      if (newRows.length > 1 && newRows.some((r) => r.name === "BOOM")) {
        throw Object.assign(new Error("bulk failed"), { code: "XX000" });
      }
      const out = [];
      for (const r of newRows) {
        if (r.org_id !== ORG_A) throw Object.assign(new Error("rls"), { code: "42501" });
        if (r.name === "BOOM") throw Object.assign(new Error("bad"), { code: "23514" });
        if (rows.some((x) => x.org_id === r.org_id && x.import_ref && x.import_ref === r.import_ref)) continue;
        const row = { id: `new-${++seq}`, pos_enabled: false, ...r };
        rows.push(row);
        out.push({ id: row.id, import_ref: row.import_ref });
      }
      return out;
    }),
    updateRow: vi.fn(async (orgId, id, patch) => {
      const row = rows.find((r) => r.id === id && r.org_id === orgId);
      if (!row) return null;
      Object.assign(row, patch);
      return { id };
    }),
    recordRun: vi.fn(async (run) => {
      runs.push(run);
    }),
    listRuns: vi.fn(async (orgId) => runs.filter((r) => r.orgId === orgId)),
    writeAudit: vi.fn(async () => {}),
    same,
  };
  return repo;
}

let repo;
let membership;
let user;
let feature;
let limited;

function handler(extra = {}) {
  return createClientImportHandler({
    getUserFromRequest: async () => ({ user }),
    loadMembership: async () => membership,
    assertFeature: feature,
    userClientFor: async () => ({}),
    adminClient: {},
    repoFor: () => repo,
    rateLimit: async () => (limited ? { ok: false, retryAfterSeconds: 30 } : { ok: true }),
    log: () => {},
    ...extra,
  });
}

async function call(op, body = {}, { method = "POST", auth = "Bearer token", h } = {}) {
  const res = mockRes();
  await (h || handler())({ method, query: { op }, headers: auth ? { authorization: auth } : {}, body, url: "/api/company/client-import" }, res);
  return res;
}

const create = (row_number, values, extra = {}) => ({ row_number, action: "create", values, ...extra });

beforeEach(() => {
  repo = makeBook();
  user = { id: USER, email: "owner@example.co.za" };
  membership = { orgId: ORG_A, companyRole: "admin", membershipRole: "owner", jobFunction: "general" };
  feature = vi.fn(async () => {});
  limited = false;
});

describe("access", () => {
  it("rejects a missing session", async () => {
    user = null;
    const res = await call("check", { rows: [] });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a till cashier", async () => {
    membership = { orgId: ORG_A, companyRole: "employee", jobFunction: "pos" };
    const res = await call("commit", { import_id: IMPORT, rows: [] });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("rejects a plan without clients", async () => {
    feature = vi.fn(async () => { throw new UpgradeRequiredError("invoices"); });
    const res = await call("check", { rows: [] });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("UPGRADE_REQUIRED");
  });

  it("rate limits a burst of imports", async () => {
    limited = true;
    const res = await call("check", { rows: [] });
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toBe("30");
  });

  it("rejects an employee who only sees their own clients", async () => {
    membership = { orgId: ORG_A, companyRole: "employee", jobFunction: "general" };
    const res = await call("commit", { import_id: IMPORT, rows: [create(2, { name: "A", email: "a@example.co.za" })] });
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe(CLIENT_IMPORT_MESSAGES.roleRequired);
    expect(repo.insertRows).not.toHaveBeenCalled();
  });

  it("checks the clients plan feature for this business", async () => {
    await call("check", { rows: [] });
    expect(feature).toHaveBeenCalledWith(USER, "clients", ORG_A);
  });

  it("passes a lapsed subscription's message through", async () => {
    feature = vi.fn(async () => {
      throw Object.assign(new UpgradeRequiredError("clients"), { code: "SUBSCRIPTION_REQUIRED", message: "Your trial has ended. You can view your data until you subscribe." });
    });
    const res = await call("check", { rows: [] });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: "SUBSCRIPTION_REQUIRED", error: expect.stringMatching(/trial has ended/) });
  });

  it("lets a manager of this business check clients", async () => {
    membership = { orgId: ORG_A, companyRole: "manager", jobFunction: "general" };
    const res = await call("check", { rows: [{ row_number: 2, email: "nobody@example.co.za" }] });
    expect(res.statusCode).toBe(200);
  });
});

describe("check and commit", () => {
  it("matches only this business, not the same email in another business", async () => {
    const res = await call("check", { rows: [{ row_number: 2, email: "thabo@example.co.za", phone: "0825550101" }] });
    expect(res.statusCode).toBe(200);
    expect(res.body.existing.map((c) => c.id)).toEqual([CLIENT_A]);
    expect(res.body.matches[0].reliable).toBe(true);
    expect(res.body.existing[0].notes).toBeUndefined();
  });

  it("creates a client in the signed-in business and ignores a company id in the body", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      filename: "../secret.csv",
      org_id: ORG_B,
      rows: [create(2, { name: "Amina Hassan", email: "amina@example.co.za", phone: "+27 11 555 0199" })],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.counts.created).toBe(1);
    const saved = repo.rows.find((r) => r.name === "Amina Hassan");
    expect(saved.org_id).toBe(ORG_A);
    expect(saved.pos_enabled).toBe(false);
    expect(saved.import_ref).toBe(`${IMPORT}:2`);
    expect(repo.runs[0].filename).toBe("secret.csv");
    expect(repo.runs[0].orgId).toBe(ORG_A);
    const audit = repo.writeAudit.mock.calls[0][0];
    expect(audit.metadata.filename).toBe("secret.csv");
    expect(JSON.stringify(audit.metadata)).not.toContain("amina@example.co.za");
  });

  it("skips an existing email unless the user explicitly imports it as new", async () => {
    const skipped = await call("commit", {
      import_id: IMPORT,
      rows: [create(2, { name: "Copy", email: "thabo@example.co.za" })],
    });
    expect(skipped.body.results[0].outcome).toBe("skipped");
    expect(repo.rows.filter((r) => r.org_id === ORG_A)).toHaveLength(1);

    const created = await call("commit", {
      import_id: IMPORT,
      rows: [create(3, { name: "Copy", email: "thabo@example.co.za" }, { allow_duplicate: true })],
    });
    expect(created.body.results[0].outcome).toBe("created");
  });

  it("updates only a reliable match the user named, and does not blank other fields", async () => {
    const ok = await call("commit", {
      import_id: IMPORT,
      rows: [{
        row_number: 2,
        action: "update",
        target_id: CLIENT_A,
        values: { name: "Thabo Nkosi", email: "thabo@example.co.za", phone: "0835550101" },
      }],
    });
    expect(ok.body.results[0].outcome).toBe("updated");
    const row = repo.rows.find((r) => r.id === CLIENT_A);
    expect(row.phone).toBe("0835550101");
    expect(row.notes).toBe("keep me");
    expect(row.tax_id).toBe("4123456789");
  });

  it("refuses to update another business's client or an unreliable match", async () => {
    const other = await call("commit", {
      import_id: IMPORT,
      rows: [{ row_number: 2, action: "update", target_id: CLIENT_B, values: { name: "Hijack", email: "thabo@example.co.za" } }],
    });
    expect(other.body.results[0].outcome).toBe("failed");
    expect(repo.rows.find((r) => r.id === CLIENT_B).name).toBe("Other Business");

    const unsure = await call("commit", {
      import_id: IMPORT,
      rows: [{
        row_number: 4,
        action: "update",
        target_id: CLIENT_A,
        values: { name: "Nope", email: "new@example.co.za" },
      }],
    });
    expect(unsure.body.results[0].reason).toBe(CLIENT_IMPORT_MESSAGES.updateRefused);
    expect(repo.rows.find((r) => r.id === CLIENT_A).name).toBe("Thabo Nkosi");
  });

  it("skips the second row in a batch that repeats an email", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [
        create(2, { name: "One", email: "dup@example.co.za" }),
        create(3, { name: "Two", email: "dup@example.co.za" }),
      ],
    });
    expect(res.body.results.map((r) => r.outcome)).toEqual(["created", "skipped"]);
    expect(repo.rows.filter((r) => r.email === "dup@example.co.za")).toHaveLength(1);
  });

  it("does not create the same row twice when the request is repeated", async () => {
    const body = { import_id: IMPORT, rows: [create(2, { name: "Once", email: "once@example.co.za" })] };
    const first = await call("commit", body);
    const second = await call("commit", body);
    expect(first.body.results[0].outcome).toBe("created");
    expect(second.body.results[0]).toMatchObject({ outcome: "created", replayed: true });
    expect(repo.rows.filter((r) => r.email === "once@example.co.za")).toHaveLength(1);
    expect(repo.runs[1].counts.created).toBe(0);
  });

  it("saves the good rows when one row in the batch fails", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [
        create(2, { name: "Good", email: "good@example.co.za" }),
        create(3, { name: "BOOM", email: "boom@example.co.za" }),
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.results.find((r) => r.row_number === 2).outcome).toBe("created");
    expect(res.body.results.find((r) => r.row_number === 3).outcome).toBe("failed");
    expect(repo.rows.some((r) => r.email === "good@example.co.za")).toBe(true);
    expect(repo.rows.some((r) => r.name === "BOOM")).toBe(false);
    expect(res.body.results[1].reason).not.toMatch(/XX000|23514/);
  });

  it("rejects an invalid email on the server even if the browser sent it as create", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [create(2, { name: "Bad", email: "not-an-email" })],
    });
    expect(res.body.results[0].outcome).toBe("failed");
    expect(res.body.results[0].reason).toMatch(/email/i);
  });

  it("requires an email on the server, the same as Add client", async () => {
    const res = await call("commit", { import_id: IMPORT, rows: [create(2, { name: "No Email", phone: "0215550100" })] });
    expect(res.body.results[0]).toMatchObject({ outcome: "failed", reason: "Email is required." });
    expect(repo.insertRows).not.toHaveBeenCalled();
  });

  it("explains each skip from a code, never from text the browser sent", async () => {
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [
        { row_number: 2, action: "skip", skip_reason: "existing", values: {} },
        { row_number: 3, action: "skip", skip_reason: "<b>pwned</b>", values: {} },
        { row_number: 4, action: "skip", skip_reason: "constructor", values: {} },
      ],
    });
    expect(res.body.results.map((r) => r.duplicate)).toEqual([true, false, false]);
    expect(res.body.results[1].reason).toBe("You chose to skip this row.");
    expect(res.body.results[2].reason).toBe("You chose to skip this row.");
  });

  it("keeps rows already created when the plan blocks the updates in the same batch", async () => {
    repo.updateRow.mockImplementation(async () => {
      throw Object.assign(new Error("Your trial has ended. You can view your data until you subscribe."), { code: "P0001", hint: "SUBSCRIPTION_REQUIRED:view_only" });
    });
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [
        create(2, { name: "Fresh", email: "fresh@example.co.za" }),
        { row_number: 3, action: "update", target_id: CLIENT_A, values: { name: "Thabo Nkosi", email: "thabo@example.co.za", phone: "0835550101" } },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.results.find((r) => r.row_number === 2).outcome).toBe("created");
    expect(res.body.results.find((r) => r.row_number === 3)).toMatchObject({ outcome: "failed", reason: expect.stringMatching(/trial has ended/) });
    expect(res.body.counts).toMatchObject({ created: 1, failed: 1 });
  });

  it("fails the whole batch with the plan message when the insert is refused", async () => {
    repo.insertRows.mockImplementation(async () => {
      throw Object.assign(new Error("Choose a Paidly plan to use this feature."), { code: "P0001", hint: "SUBSCRIPTION_REQUIRED:clients" });
    });
    const res = await call("commit", {
      import_id: IMPORT,
      rows: [create(2, { name: "A", email: "a@example.co.za" }), create(3, { name: "B", email: "b@example.co.za" })],
    });
    expect(res.body.results.map((r) => r.outcome)).toEqual(["failed", "failed"]);
    expect(res.body.results[0].reason).toBe("Choose a Paidly plan to use this feature.");
    expect(repo.insertRows).toHaveBeenCalledTimes(1);
  });
});
