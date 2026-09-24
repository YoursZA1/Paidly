/**
 * Database boundary for customer money (20260925090000_customer_payment_integrity_guards.sql), on real
 * Postgres (PGlite) with real role switching, the way PostgREST runs requests:
 *   - an end user (authenticated) cannot insert, edit or delete payments — only the Payment Engine
 *     (service_role) records money
 *   - an invoice cannot be created paid, nor moved to paid / partially paid without payments behind it
 *   - payment_intents: document intents may be ozow or cash (approved offline settlement), nothing else
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = path.resolve(
  __dirname,
  "../../supabase/migrations/20260925090000_customer_payment_integrity_guards.sql"
);

// The pre-existing shape: payments writable by org members (the gap), plus the intents CHECK.
const STUB = `
create role service_role bypassrls; create role authenticated; create role anon;
create schema auth;
grant usage on schema auth to authenticated, service_role;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to authenticated, service_role;
create table public.invoices (id uuid primary key, org_id uuid, status text, total_amount numeric(12,2));
create table public.payments (id uuid primary key default gen_random_uuid(), org_id uuid not null,
  invoice_id uuid, amount numeric(12,2) not null default 0, status text not null default 'pending',
  paid_at timestamptz, method text, reference text);
create table public.payment_intents (id uuid primary key default gen_random_uuid(), org_id uuid,
  source_kind text not null, provider text not null, document_id uuid,
  constraint payment_intents_pos_provider_check check (
    (source_kind = 'pos' and provider in ('cash', 'ozow', 'card_terminal'))
    or (source_kind = 'document' and provider in ('ozow'))));
alter table public.payments enable row level security;
create policy "org members write payments" on public.payments for all using (true) with check (true);
create policy "org members select payments" on public.payments for select using (true);
grant all on public.invoices, public.payments, public.payment_intents to authenticated, service_role;
alter table public.payments force row level security;
`;

const ORG = "10000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const INVOICE = "30000000-0000-4000-8000-000000000001";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;

/** Run as a role: "user" = authenticated JWT (OWNER), "engine" = service_role. Returns "ok" or code. */
async function as(who, sql, params) {
  await db.exec("begin");
  try {
    if (who === "user") {
      await q(`select set_config('request.jwt.claim.sub', $1, true)`, [OWNER]);
      await db.exec("set local role authenticated");
    } else {
      await db.exec("set local role service_role");
    }
    await q(sql, params);
    await db.exec("commit");
    return "ok";
  } catch (err) {
    await db.exec("rollback");
    return err.hint || err.code || err.message;
  }
}

const insertPayment = (who, amount = 1000, method = "cash") =>
  as(who, `insert into public.payments (org_id, invoice_id, amount, status, paid_at, method) values ($1, $2, $3, 'paid', now(), $4)`, [
    ORG,
    INVOICE,
    amount,
    method,
  ]);
const setStatus = (who, status) => as(who, `update public.invoices set status = $1 where id = $2`, [status, INVOICE]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec(readFileSync(MIGRATION, "utf8")); // idempotent
}, 60_000);

beforeEach(async () => {
  await q(`delete from public.payments`);
  await q(`delete from public.invoices`);
  await q(`insert into public.invoices values ($1, $2, 'sent', 1000)`, [INVOICE, ORG]);
});

describe("payments: only the Payment Engine records money", () => {
  it("an end user cannot insert a payment — any method, including 'cash' and 'ozow'", async () => {
    for (const method of ["cash", "bank_transfer", "ozow"]) {
      expect(await insertPayment("user", 1000, method)).toBe("42501"); // insufficient_privilege
    }
    expect(await q(`select * from public.payments`)).toHaveLength(0);
  });

  it("the Engine (service_role) records it; the user can read but not edit or delete it", async () => {
    expect(await insertPayment("engine", 1000, "ozow")).toBe("ok");
    expect(await as("user", `select * from public.payments`)).toBe("ok");
    expect(await as("user", `update public.payments set amount = 1`)).toBe("42501");
    expect(await as("user", `delete from public.payments`)).toBe("42501");
    expect(await q(`select amount::float from public.payments`)).toEqual([{ amount: 1000 }]);
  });

  it("the org-member write policy is gone", async () => {
    const policies = await q(`select policyname from pg_policies where tablename = 'payments' order by 1`);
    expect(policies.map((p) => p.policyname)).toEqual(["org members select payments"]);
  });
});

describe("invoices: paid follows payments, never a status write", () => {
  it("cannot create an invoice already paid or partially paid", async () => {
    for (const status of ["paid", "partially_paid", "partial_paid"]) {
      const res = await as("user", `insert into public.invoices values (gen_random_uuid(), $1, $2, 500)`, [ORG, status]);
      expect(res).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
    }
    expect(await as("user", `insert into public.invoices values (gen_random_uuid(), $1, 'sent', 500)`, [ORG])).toBe("ok");
  });

  it("cannot mark paid / partially paid without payments; can once the Engine recorded them", async () => {
    expect(await setStatus("user", "paid")).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
    expect(await setStatus("user", "partially_paid")).toBe("INVOICE_STATUS_NEEDS_PAYMENT");

    await insertPayment("engine", 400);
    expect(await setStatus("user", "paid")).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
    expect(await setStatus("user", "partially_paid")).toBe("ok");
    await insertPayment("engine", 600);
    expect(await setStatus("user", "paid")).toBe("ok");
  });

  it("failed / cancelled payment rows do not count", async () => {
    await q(`insert into public.payments (org_id, invoice_id, amount, status, method) values ($1, $2, 1000, 'failed', 'ozow')`, [ORG, INVOICE]);
    await q(`insert into public.payments (org_id, invoice_id, amount, status, method) values ($1, $2, 1000, 'cancelled', 'cash')`, [ORG, INVOICE]);
    expect(await setStatus("user", "paid")).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
  });

  it("other status changes are untouched; the Engine's settlement is not gated", async () => {
    expect(await setStatus("user", "overdue")).toBe("ok");
    expect(await setStatus("engine", "paid")).toBe("ok");
  });
});

describe("payment_intents rails", () => {
  const intent = (source, provider) =>
    as("engine", `insert into public.payment_intents (org_id, source_kind, provider, document_id) values ($1, $2, $3, $4)`, [
      ORG,
      source,
      provider,
      INVOICE,
    ]);

  it("document: ozow and cash (approved offline) allowed; card_terminal and payfast refused", async () => {
    expect(await intent("document", "ozow")).toBe("ok");
    expect(await intent("document", "cash")).toBe("ok");
    expect(await intent("document", "card_terminal")).toBe("23514"); // check_violation
    expect(await intent("document", "payfast")).toBe("23514");
    expect(await intent("pos", "payfast")).toBe("23514");
  });
});
