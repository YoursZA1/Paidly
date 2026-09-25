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
const FOLLOWUP = path.resolve(
  __dirname,
  "../../supabase/migrations/20260925130000_customer_payment_engine_followups.sql"
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
create table public.pos_sales_events (id uuid primary key default gen_random_uuid(), org_id uuid,
  payment_intent_id uuid, sale_kind text not null default 'sale');
alter table public.payments enable row level security;
create policy "org members write payments" on public.payments for all using (true) with check (true);
create policy "org members select payments" on public.payments for select using (true);
grant all on public.invoices, public.payments, public.payment_intents to authenticated, service_role;
grant all on public.pos_sales_events to service_role;
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
  await db.exec(readFileSync(FOLLOWUP, "utf8"));
  await db.exec(readFileSync(FOLLOWUP, "utf8")); // idempotent
}, 60_000);

beforeEach(async () => {
  await q(`delete from public.payments`);
  await q(`delete from public.pos_sales_events`);
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

describe("follow-ups (20260925130000): no paid invoice without money, one settlement per intent", () => {
  const setTotal = (who, total) => as(who, `update public.invoices set total_amount = $1 where id = $2`, [total, INVOICE]);
  const invoiceRow = async () => (await q(`select status, total_amount::float as total from public.invoices`))[0];

  it("closes the two-step bypass: zero the total + mark paid, then restore the total", async () => {
    // Step 1 alone is harmless (a R0 invoice owes nothing)…
    expect(await as("user", `update public.invoices set status = 'paid', total_amount = 0 where id = $1`, [INVOICE])).toBe("ok");
    // …but step 2 must not turn it into a R1000 invoice "paid" with nothing received.
    expect(await setTotal("user", 1000)).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
    expect(await invoiceRow()).toEqual({ status: "paid", total: 0 });
  });

  it("a paid / partially paid invoice's total cannot move past the payments behind it", async () => {
    await insertPayment("engine", 400);
    expect(await setStatus("user", "partially_paid")).toBe("ok");
    expect(await setTotal("user", 400)).toBe("INVOICE_STATUS_NEEDS_PAYMENT"); // would be fully paid: status must follow
    expect(await setTotal("user", 1200)).toBe("ok"); // still partially paid (400 of 1200)
    await insertPayment("engine", 800);
    expect(await setStatus("user", "paid")).toBe("ok");
    expect(await setTotal("user", 1500)).toBe("INVOICE_STATUS_NEEDS_PAYMENT");
    expect(await setTotal("user", 1200)).toBe("ok"); // unchanged value
    expect(await as("user", `update public.invoices set status = 'sent', total_amount = 5000 where id = $1`, [INVOICE])).toBe("ok");
  });

  it("does not gate unpaid invoices or the Engine", async () => {
    expect(await setTotal("user", 50)).toBe("ok");
    await as("engine", `update public.invoices set status = 'paid', total_amount = 0 where id = $1`, [INVOICE]);
    expect(await setTotal("engine", 999)).toBe("ok");
  });

  it("payments: one row per intent reference on every rail (cash / EFT too, not only ozow)", async () => {
    const intentId = "40000000-0000-4000-8000-000000000001";
    const settle = (method, reference = intentId) =>
      as("engine", `insert into public.payments (org_id, invoice_id, amount, status, paid_at, method, reference) values ($1, $2, 100, 'paid', now(), $3, $4)`, [
        ORG,
        INVOICE,
        method,
        reference,
      ]);
    expect(await settle("bank_transfer")).toBe("ok");
    expect(await settle("bank_transfer")).toBe("23505"); // unique_violation
    expect(await settle("cash", intentId.toUpperCase())).toBe("23505");
    // Free-text references from before the lockdown stay non-unique.
    expect(await settle("cash", "EFT")).toBe("ok");
    expect(await settle("cash", "EFT")).toBe("ok");
  });

  it("pos_sales_events: one sale per payment intent; returns and intent-less rows are not constrained", async () => {
    const intentId = "50000000-0000-4000-8000-000000000001";
    const sale = (kind, pi = intentId) =>
      as("engine", `insert into public.pos_sales_events (org_id, payment_intent_id, sale_kind) values ($1, $2, $3)`, [ORG, pi, kind]);
    expect(await sale("sale")).toBe("ok");
    expect(await sale("sale")).toBe("23505");
    expect(await sale("return")).toBe("ok");
    expect(await sale("sale", null)).toBe("ok");
    expect(await sale("sale", null)).toBe("ok");
  });

  it("existing duplicates: the index is skipped with a warning, the rest of the migration still applies", async () => {
    const fresh = new PGlite();
    await fresh.exec(STUB);
    await fresh.exec(readFileSync(MIGRATION, "utf8"));
    const dup = "60000000-0000-4000-8000-000000000001";
    await fresh.query(`insert into public.payments (org_id, amount, reference, method) values ($1, 1, $2, 'cash'), ($1, 1, $2, 'cash')`, [ORG, dup]);
    await fresh.query(`insert into public.pos_sales_events (org_id, payment_intent_id) values ($1, $2), ($1, $2)`, [ORG, dup]);
    await fresh.exec(readFileSync(FOLLOWUP, "utf8"));
    const idx = await fresh.query(`select indexname from pg_indexes where indexname in ('payments_engine_intent_reference_uniq', 'pos_sales_events_one_sale_per_intent')`);
    expect(idx.rows).toEqual([]);
    const trg = await fresh.query(`select tgname from pg_trigger where tgname = 'paidly_invoice_paid_status_guard'`);
    expect(trg.rows).toHaveLength(1);
    await fresh.close();
  }, 60_000);
});
