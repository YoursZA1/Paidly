/**
 * Demo Mode on the REAL schema (every migration replayed on PGlite), queried as signed-in users
 * through RLS exactly like PostgREST.
 *
 * Cast:
 *   demo   — a Try Live Demo visitor: auth user + provisioned "Mavela Café" demo workspace
 *   demo2  — a second concurrent visitor (own workspace)
 *   owner  — a real Paidly customer (self-signup, Company R)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { replaySupabaseSchema, runAs } from "./fixtures/supabaseSchemaReplay.js";
import { deriveTableStatus, tabBalance, tabTotals, TABLE_STATUS } from "../../shared/pos/restaurant.js";

let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const as = (user, sql, params) => runAs(db, user, sql, params);
const rowsAs = async (user, sql, params) => {
  const r = await as(user, sql, params);
  if (!r.ok) throw new Error(`${user}: ${r.message}`);
  return r.rows;
};
const num = (v) => Number(v);

const U = {
  demo: "d0000000-0000-4000-8000-000000000001",
  demo2: "d0000000-0000-4000-8000-000000000002",
  owner: "e0000000-0000-4000-8000-000000000001",
};
const ORG = {};
const ROW = {};

/** Server path: auth user without a personal org (pending_company_invite), then provision. */
async function createDemoVisitor(id) {
  await q(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
           values ($1, $2, '{"pending_company_invite":"true","full_name":"Demo visitor"}', '{"paidly_demo":true}', now())`, [
    id,
    `demo-${id.slice(-4)}@example.com`,
  ]);
  const r = await one(`select public.provision_demo_workspace($1, 120, 'test') as out`, [id]);
  return r.out;
}

async function counts(org) {
  const c = async (sql) => num((await one(sql, [org])).n);
  return {
    clients: await c(`select count(*) n from public.clients where org_id = $1`),
    invoices: await c(`select count(*) n from public.invoices where org_id = $1`),
    invoiceItems: await c(`select count(*) n from public.invoice_items ii join public.invoices i on i.id = ii.invoice_id where i.org_id = $1`),
    quotes: await c(`select count(*) n from public.quotes where org_id = $1`),
    products: await c(`select count(*) n from public.services where org_id = $1 and item_type = 'product'`),
    services: await c(`select count(*) n from public.services where org_id = $1 and item_type = 'service'`),
    expenses: await c(`select count(*) n from public.expenses where org_id = $1`),
    employees: await c(`select count(*) n from public.memberships where org_id = $1 and user_id is null`),
    payroll: await c(`select count(*) n from public.payroll_profiles where org_id = $1`),
    payments: await c(`select count(*) n from public.payments where org_id = $1`),
    posSales: await c(`select count(*) n from public.pos_sales_events where org_id = $1`),
    intents: await c(`select count(*) n from public.payment_intents where org_id = $1`),
    tables: await c(`select count(*) n from public.pos_tables where org_id = $1`),
    tabs: await c(`select count(*) n from public.pos_tabs where org_id = $1`),
    tickets: await c(`select count(*) n from public.pos_kitchen_tickets where org_id = $1`),
    sessions: await c(`select count(*) n from public.pos_register_sessions where org_id = $1`),
    movements: await c(`select count(*) n from public.inventory_movements m join public.services s on s.id = m.product_id where s.org_id = $1`),
    stock: await c(`select coalesce(sum(stock_quantity), 0) n from public.services where org_id = $1`),
  };
}

beforeAll(async () => {
  db = await replaySupabaseSchema();

  // Real customer: normal self-signup (own org + trial) and a real invoice.
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@realco.test', '{"org_name":"Real Co","plan":"business"}')`, [
    U.owner,
  ]);
  ORG.real = (await one(`select id from public.organizations where owner_id = $1`, [U.owner])).id;
  ROW.realClient = (await one(`insert into public.clients (org_id, name, email) values ($1, 'Real Client', 'client@realco.test') returning id`, [ORG.real])).id;
  ROW.realInvoice = (
    await one(
      `insert into public.invoices (org_id, client_id, invoice_number, status, total_amount, user_id, created_by)
       values ($1, $2, 'R-1', 'sent', 999, $3, $3) returning id`,
      [ORG.real, ROW.realClient, U.owner]
    )
  ).id;

  const first = await createDemoVisitor(U.demo);
  ORG.demo = first.org_id;
  ORG.demo2 = (await createDemoVisitor(U.demo2)).org_id;
}, 300_000);

describe("provisioning", () => {
  it("creates a flagged demo org owned only by the visitor, with a demo entitlement", async () => {
    const org = await one(`select * from public.organizations where id = $1`, [ORG.demo]);
    expect(org).toMatchObject({ name: "Mavela Café", is_demo: true, is_internal: true, business_type: "restaurant", owner_id: U.demo });
    expect(new Date(org.demo_expires_at).getTime()).toBeGreaterThan(Date.now());

    const memberships = await q(`select org_id, role from public.memberships where user_id = $1`, [U.demo]);
    expect(memberships).toEqual([{ org_id: ORG.demo, role: "owner" }]);

    const subs = await q(`select subscription_source, status, plan_family, amount, provider from public.subscriptions where user_id = $1`, [U.demo]);
    expect(subs).toEqual([{ subscription_source: "demo", status: "trialing", plan_family: "growth", amount: "0", provider: "demo" }]);
    const plan = await one(`select * from public.paidly_company_plan($1, $2)`, [ORG.demo, U.demo]);
    expect(plan).toMatchObject({ family: "growth", has_access: true });

    const profile = await one(`select currency, timezone, company_name from public.profiles where id = $1`, [U.demo]);
    expect(profile).toMatchObject({ currency: "ZAR", timezone: "Africa/Johannesburg", company_name: "Mavela Café" });
  });

  it("refuses to provision into an existing (real) account", async () => {
    await expect(q(`select public.provision_demo_workspace($1, 60)`, [U.owner])).rejects.toThrow(/already has a workspace/);
  });

  it("is not callable by end users", async () => {
    for (const sql of [
      `select public.provision_demo_workspace('${U.demo}'::uuid, 60)`,
      `select public.reset_demo_workspace('${U.demo}'::uuid)`,
      `select * from public.purge_expired_demo_workspaces(10)`,
      `select public.demo_purge_org_data('${ORG.demo}'::uuid)`,
      `select public.purge_demo_workspace('${U.demo}'::uuid)`,
      `select public.seed_demo_business('${ORG.demo}'::uuid, '${U.demo}'::uuid)`,
    ]) {
      const r = await as(U.demo, sql);
      expect(r.ok, sql).toBe(false);
      expect(r.code).toBe("42501");
    }
  });
});

describe("dataset", () => {
  it("has the required interconnected records", async () => {
    const c = await counts(ORG.demo);
    expect(c).toMatchObject({
      clients: 15,
      invoices: 20,
      quotes: 8,
      products: 18,
      services: 4,
      expenses: 24,
      employees: 7,
      payroll: 7,
      payments: 9,
      tables: 10,
      tabs: 14,
      sessions: 2,
    });
    expect(c.posSales).toBeGreaterThanOrEqual(150);
    expect(c.intents).toBe(c.posSales + 1); // + Table 8's in-flight simulated card payment
  });

  it("invoices: status mix, VAT maths, line items and payments are consistent", async () => {
    const statuses = await q(`select status, count(*)::int n from public.invoices where org_id = $1 group by 1 order by 1`, [ORG.demo]);
    expect(Object.fromEntries(statuses.map((r) => [r.status, r.n]))).toEqual({
      draft: 2,
      overdue: 4,
      paid: 8,
      partially_paid: 1,
      sent: 3,
      viewed: 2,
    });
    const invoices = await q(
      `select i.id, i.status, i.subtotal, i.tax_amount, i.total_amount, i.delivery_date, i.client_id, i.currency,
              (select sum(total_price) from public.invoice_items ii where ii.invoice_id = i.id) items_total,
              (select coalesce(sum(amount), 0) from public.payments p where p.invoice_id = i.id) paid
       from public.invoices i where i.org_id = $1`,
      [ORG.demo]
    );
    for (const inv of invoices) {
      expect(inv.currency).toBe("ZAR");
      expect(inv.client_id).toBeTruthy();
      expect(num(inv.items_total)).toBeCloseTo(num(inv.subtotal), 2);
      expect(num(inv.tax_amount)).toBeCloseTo(Math.round(num(inv.subtotal) * 15) / 100, 2);
      expect(num(inv.total_amount)).toBeCloseTo(num(inv.subtotal) + num(inv.tax_amount), 2);
      if (inv.status === "paid") expect(num(inv.paid)).toBeCloseTo(num(inv.total_amount), 2);
      if (inv.status === "partially_paid") expect(num(inv.paid)).toBeGreaterThan(0);
      if (inv.status === "overdue") expect(new Date(inv.delivery_date).getTime()).toBeLessThan(Date.now());
      if (["sent", "viewed", "draft"].includes(inv.status)) expect(num(inv.paid)).toBe(0);
    }
    const numbers = await q(`select invoice_number from public.invoices where org_id = $1 order by 1`, [ORG.demo]);
    expect(numbers[0].invoice_number).toBe("INV-1001");
    expect(numbers[19].invoice_number).toBe("INV-1020");
  });

  it("quotes: status mix, and the converted quote is linked to its invoice", async () => {
    const statuses = await q(`select status, count(*)::int n from public.quotes where org_id = $1 group by 1`, [ORG.demo]);
    expect(Object.fromEntries(statuses.map((r) => [r.status, r.n]))).toEqual({
      accepted: 2,
      converted: 1,
      declined: 1,
      expired: 1,
      sent: 2,
      viewed: 1,
    });
    const linked = await one(
      `select i.invoice_number, q.quote_number from public.invoices i join public.quotes q on q.id = i.source_quote_id where i.org_id = $1`,
      [ORG.demo]
    );
    expect(linked).toEqual({ invoice_number: "INV-1009", quote_number: "QUO-1001" });
  });

  it("numbering continues after the seed", async () => {
    const next = await rowsAs(U.demo, `select public.next_document_number($1, 'invoice', 'INV') as n`, [ORG.demo]);
    expect(next[0].n).toBe("INV-1021");
  });

  it("inventory: stock levels are explained by movements, with low-stock items", async () => {
    const rows = await q(
      `select s.name, s.stock_quantity, s.low_stock_threshold,
              coalesce(sum(case when m.type = 'in' then m.quantity else -m.quantity end), 0) net
       from public.services s left join public.inventory_movements m on m.product_id = s.id
       where s.org_id = $1 and s.item_type = 'product' group by s.id`,
      [ORG.demo]
    );
    for (const r of rows) expect(num(r.net), r.name).toBeCloseTo(num(r.stock_quantity), 2);
    const low = rows.filter((r) => num(r.stock_quantity) <= num(r.low_stock_threshold)).map((r) => r.name).sort();
    expect(low).toEqual(["Blueberry Muffin", "Bottled Water 500ml", "Chicken Wrap", "Garden Salad"]);
  });

  it("POS sales are linked to paid intents and match their lines", async () => {
    const sales = await q(
      `select s.id, s.total_amount, s.items, s.payment_method, pi.status, pi.provider, pi.amount, pi.pos_sale_event_id
       from public.pos_sales_events s join public.payment_intents pi on pi.id = s.payment_intent_id where s.org_id = $1`,
      [ORG.demo]
    );
    const methods = new Set();
    for (const s of sales) {
      methods.add(s.payment_method);
      expect(s.status).toBe("paid");
      expect(s.pos_sale_event_id).toBe(s.id);
      expect(num(s.amount)).toBeCloseTo(num(s.total_amount), 2);
      const lines = s.items.reduce((sum, l) => sum + num(l.line_total), 0);
      expect(lines).toBeCloseTo(num(s.total_amount), 2);
      expect(s.provider).toBe(s.payment_method === "card" ? "card_terminal" : "cash");
    }
    expect([...methods].sort()).toEqual(["card", "cash"]);
    const today = await one(
      `select count(*)::int n from public.pos_sales_events where org_id = $1 and occurred_at > now() - interval '1 day'`,
      [ORG.demo]
    );
    expect(today.n).toBeGreaterThanOrEqual(9);
  });

  it("restaurant floor shows every table status, with dine-in and takeaway orders", async () => {
    const tables = await q(`select * from public.pos_tables where org_id = $1`, [ORG.demo]);
    const statusOf = async (table) => {
      const tab = await one(`select * from public.pos_tabs where table_id = $1 and status = 'open'`, [table.id]);
      if (!tab) return deriveTableStatus({ table });
      const items = await q(`select * from public.pos_tab_items where tab_id = $1`, [tab.id]);
      const tickets = await q(`select * from public.pos_kitchen_tickets where tab_id = $1`, [tab.id]);
      const portions = await q(
        `select pi.amount, pi.status from public.pos_tab_payments tp join public.payment_intents pi on pi.id = tp.payment_intent_id where tp.tab_id = $1`,
        [tab.id]
      );
      const totals = tabTotals({ items });
      return deriveTableStatus({ table, tab, items, tickets, balance: tabBalance({ total: totals.total, portions }) });
    };
    const byName = {};
    for (const t of tables) byName[t.name] = await statusOf(t);
    expect(byName).toEqual({
      "Table 1": TABLE_STATUS.AVAILABLE,
      "Table 2": TABLE_STATUS.ORDERING,
      "Table 3": TABLE_STATUS.KITCHEN,
      "Table 4": TABLE_STATUS.AVAILABLE,
      "Table 5": TABLE_STATUS.READY,
      "Table 6": TABLE_STATUS.BILL_REQUESTED,
      "Table 7": TABLE_STATUS.AVAILABLE,
      "Table 8": TABLE_STATUS.PAYMENT_PENDING,
      "Table 9": TABLE_STATUS.SEATED,
      "Table 10": TABLE_STATUS.CLEANING,
    });
    const tabs = await q(`select order_type, status, count(*)::int n from public.pos_tabs where org_id = $1 group by 1, 2 order by 1, 2`, [ORG.demo]);
    expect(tabs).toEqual([
      { order_type: "dine_in", status: "closed", n: 4 },
      { order_type: "dine_in", status: "open", n: 6 },
      { order_type: "dine_in", status: "void", n: 1 },
      { order_type: "takeaway", status: "open", n: 2 },
      { order_type: "takeaway", status: "void", n: 1 },
    ]);
    const openSession = await one(`select count(*)::int n from public.pos_register_sessions where org_id = $1 and status = 'open'`, [ORG.demo]);
    expect(openSession.n).toBe(1);
  });

  it("the demo owner reads the dataset through RLS (dashboard / reports / POS reads)", async () => {
    const [inv] = await rowsAs(U.demo, `select count(*)::int n from public.invoices where org_id = $1`, [ORG.demo]);
    const [sales] = await rowsAs(U.demo, `select count(*)::int n, sum(total_amount) s from public.pos_sales_events where org_id = $1`, [ORG.demo]);
    const [exp] = await rowsAs(U.demo, `select count(*)::int n from public.expenses where org_id = $1`, [ORG.demo]);
    const [pay] = await rowsAs(U.demo, `select sum(amount) s from public.payments where org_id = $1`, [ORG.demo]);
    expect(inv.n).toBe(20);
    expect(sales.n).toBeGreaterThanOrEqual(150);
    expect(num(sales.s)).toBeGreaterThan(10000);
    expect(exp.n).toBe(24);
    expect(num(pay.s)).toBeGreaterThan(40000);
  });
});

describe("isolation", () => {
  it("a demo visitor sees only their own demo business", async () => {
    const orgs = await rowsAs(U.demo, `select id from public.organizations`);
    expect(orgs.map((o) => o.id)).toEqual([ORG.demo]);
    for (const table of ["clients", "invoices", "quotes", "expenses", "payments", "pos_sales_events", "services", "memberships"]) {
      const rows = await rowsAs(U.demo, `select distinct org_id from public.${table}`);
      expect(rows.map((r) => r.org_id), table).toEqual(rows.length ? [ORG.demo] : []);
    }
  });

  it("cannot read or change a real business by guessing IDs", async () => {
    expect(await rowsAs(U.demo, `select * from public.invoices where id = $1`, [ROW.realInvoice])).toEqual([]);
    expect(await rowsAs(U.demo, `select * from public.clients where id = $1`, [ROW.realClient])).toEqual([]);
    expect(await rowsAs(U.demo, `select * from public.invoices where org_id = $1`, [ORG.real])).toEqual([]);
    const upd = await as(U.demo, `update public.invoices set total_amount = 1 where id = $1`, [ROW.realInvoice]);
    expect(upd.ok ? upd.affectedRows : 0).toBe(0);
    const ins = await as(U.demo, `insert into public.clients (org_id, name) values ($1, 'Injected')`, [ORG.real]);
    expect(ins.ok).toBe(false);
    const real = await one(`select total_amount from public.invoices where id = $1`, [ROW.realInvoice]);
    expect(num(real.total_amount)).toBe(999);
  });

  it("two demo visitors never see each other", async () => {
    expect(await rowsAs(U.demo, `select id from public.invoices where org_id = $1`, [ORG.demo2])).toEqual([]);
    expect(await rowsAs(U.demo2, `select id from public.invoices where org_id = $1`, [ORG.demo])).toEqual([]);
  });

  it("a real business cannot see demo data", async () => {
    expect((await rowsAs(U.owner, `select id from public.organizations`)).map((o) => o.id)).toEqual([ORG.real]);
    expect(await rowsAs(U.owner, `select id from public.invoices where org_id = $1`, [ORG.demo])).toEqual([]);
    expect(await rowsAs(U.owner, `select * from public.demo_sessions`)).toEqual([]);
  });

  it("demo_sessions: a visitor reads only their own row and cannot write it", async () => {
    const own = await rowsAs(U.demo, `select user_id, org_id from public.demo_sessions`);
    expect(own).toEqual([{ user_id: U.demo, org_id: ORG.demo }]);
    const extend = await as(U.demo, `update public.demo_sessions set expires_at = now() + interval '1 year'`);
    expect(extend.ok).toBe(false);
  });
});

describe("demo restrictions (database-enforced)", () => {
  const restricted = (r) => {
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Demo Mode|permission denied|row-level security/i);
  };

  it("cannot flip or extend demo status, or create another business", async () => {
    restricted(await as(U.demo, `update public.organizations set is_demo = false where id = $1`, [ORG.demo]));
    restricted(await as(U.demo, `update public.organizations set demo_expires_at = now() + interval '1 year' where id = $1`, [ORG.demo]));
    restricted(await as(U.demo, `insert into public.organizations (name, owner_id) values ('Escape', $1)`, [U.demo]));
    restricted(await as(U.owner, `update public.organizations set is_demo = true where id = $1`, [ORG.real]));
    const org = await one(`select is_demo from public.organizations where id = $1`, [ORG.real]);
    expect(org.is_demo).toBe(false);
  });

  it("invites, API keys, devices, provider connections and billing are refused for demo orgs — even for the server", async () => {
    await expect(
      q(`insert into public.company_invites (org_id, email, role, token, status) values ($1, 'x@realperson.test', 'employee', 'tok', 'pending')`, [ORG.demo])
    ).rejects.toThrow(/Demo Mode/);
    await expect(
      q(`insert into public.pos_connections (org_id, provider, label) values ($1, 'square', 'Square')`, [ORG.demo])
    ).rejects.toThrow(/Demo Mode/);
    await expect(
      q(`insert into public.pos_custom_providers (org_id, provider_name) values ($1, 'Acme Pay')`, [ORG.demo])
    ).rejects.toThrow(/Demo Mode/);
    await expect(
      q(`insert into public.subscriptions (user_id, email, company_id, status, plan, subscription_source) values ($1, 'x@example.com', $2, 'pending', 'growth', 'payfast')`, [
        U.demo,
        ORG.demo,
      ])
    ).rejects.toThrow(/Demo Mode/);
    const keyCols = await q(`select column_name from information_schema.columns where table_name = 'paidly_api_keys' and is_nullable = 'NO' and column_default is null`);
    expect(keyCols.length).toBeGreaterThan(0);
    await expect(q(`insert into public.paidly_api_keys (org_id) values ($1)`, [ORG.demo])).rejects.toThrow(/Demo Mode|null value/);
  });

  it("memberships: no real user can be linked into a demo org, and demo users never join real orgs", async () => {
    await expect(q(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'employee')`, [ORG.demo, U.owner])).rejects.toThrow(
      /Demo Mode/
    );
    await expect(q(`insert into public.memberships (org_id, user_id, role) values ($1, $2, 'employee')`, [ORG.real, U.demo])).rejects.toThrow(
      /Demo Mode/
    );
    // Fictional staff without a login are fine.
    const r = await as(U.demo, `insert into public.memberships (org_id, role, invited_name) values ($1, 'employee', 'New Waiter') returning id`, [ORG.demo]);
    expect(r.ok, r.message).toBe(true);
  });

  it("the append-only audit exception only applies inside a demo purge of a demo org", async () => {
    const del = await as(U.owner, `delete from public.document_events where org_id = $1`, [ORG.real]);
    expect(del.ok ? del.affectedRows : 0).toBe(0);
    await db.exec("begin");
    try {
      await db.query(`select set_config('paidly.demo_purge', $1, true)`, [ORG.real]);
      await expect(db.query(`delete from public.document_events where org_id = $1`, [ORG.real])).rejects.toThrow(/immutable/);
    } finally {
      await db.exec("rollback");
    }
  });

  it("normal product writes work inside the demo", async () => {
    const client = await as(U.demo, `insert into public.clients (org_id, name, email) values ($1, 'Walk-in Prospect', 'p@example.com') returning id`, [ORG.demo]);
    expect(client.ok, client.message).toBe(true);
    const inv = await as(
      U.demo,
      `insert into public.invoices (org_id, client_id, invoice_number, status, total_amount, user_id, created_by, currency)
       values ($1, $2, 'INV-9999', 'draft', 100, $3, $3, 'ZAR') returning id`,
      [ORG.demo, client.rows[0].id, U.demo]
    );
    expect(inv.ok, inv.message).toBe(true);
    const exp = await as(U.demo, `insert into public.expenses (org_id, category, description, amount) values ($1, 'supplies', 'Sugar', 120) returning id`, [ORG.demo]);
    expect(exp.ok, exp.message).toBe(true);
  });
});

describe("reset", () => {
  it("restores the exact seed state without touching the real business or the other demo", async () => {
    const before = await counts(ORG.demo);
    const realBefore = await counts(ORG.real);
    const otherBefore = await counts(ORG.demo2);

    // Visitor activity: new records, stock changes, a closed tab, deletions.
    await rowsAs(U.demo, `insert into public.clients (org_id, name) values ($1, 'Extra')`, [ORG.demo]);
    await rowsAs(U.demo, `delete from public.expenses where org_id = $1 and expense_number = 'EXP-1001'`, [ORG.demo]);
    await rowsAs(U.demo, `update public.services set stock_quantity = 1 where org_id = $1 and sku = 'MC-CAP'`, [ORG.demo]);
    await q(`update public.pos_tabs set status = 'closed', closed_at = now() where org_id = $1 and order_number = 1005`, [ORG.demo]);
    // A finalized-looking pay run would normally be undeletable.
    const changed = await counts(ORG.demo);
    expect(changed).not.toEqual(before);

    const out = await one(`select public.reset_demo_workspace($1) as out`, [U.demo]);
    expect(out.out.org_id).toBe(ORG.demo);

    const after = await counts(ORG.demo);
    // posSales / movements are generated from the same deterministic plan.
    expect(after).toEqual({ ...before, clients: 15, invoices: 20, expenses: 24, employees: 7 });
    expect(await counts(ORG.real)).toEqual(realBefore);
    expect(await counts(ORG.demo2)).toEqual(otherBefore);
    const cap = await one(`select stock_quantity from public.services where org_id = $1 and sku = 'MC-CAP'`, [ORG.demo]);
    expect(num(cap.stock_quantity)).toBe(190);
    const session = await one(`select reset_count from public.demo_sessions where user_id = $1`, [U.demo]);
    expect(session.reset_count).toBe(1);
    // Still the owner, still entitled.
    const plan = await one(`select * from public.paidly_company_plan($1, $2)`, [ORG.demo, U.demo]);
    expect(plan.has_access).toBe(true);
    expect((await rowsAs(U.demo, `select id from public.organizations`)).map((o) => o.id)).toEqual([ORG.demo]);
  });

  it("refuses to reset an expired or unknown demo", async () => {
    await expect(q(`select public.reset_demo_workspace($1)`, [U.owner])).rejects.toThrow(/DEMO_SESSION_NOT_FOUND/);
  });
});

describe("expiry and cleanup", () => {
  it("an expired demo keeps reads but loses write access", async () => {
    await q(`update public.subscriptions set trial_ends_at = now() - interval '1 minute' where user_id = $1`, [U.demo2]);
    const w = await as(U.demo2, `insert into public.clients (org_id, name) values ($1, 'Late')`, [ORG.demo2]);
    expect(w.ok).toBe(false);
    expect(w.message).toMatch(/plan|renew/i);
  });

  it("purges expired workspaces completely and leaves real data untouched", async () => {
    const realBefore = await counts(ORG.real);
    await q(`update public.demo_sessions set expires_at = now() - interval '1 minute' where user_id = $1`, [U.demo2]);

    const purged = await q(`select * from public.purge_expired_demo_workspaces(10)`);
    expect(purged).toEqual([{ user_id: U.demo2, org_id: ORG.demo2 }]);
    expect(await one(`select count(*)::int n from public.organizations where id = $1`, [ORG.demo2])).toEqual({ n: 0 });
    expect(await one(`select count(*)::int n from public.subscriptions where user_id = $1`, [U.demo2])).toEqual({ n: 0 });
    for (const table of ["clients", "invoices", "pos_sales_events", "payment_intents", "document_events", "client_relationship_events", "pos_register_sessions"]) {
      expect(await one(`select count(*)::int n from public.${table} where org_id = $1`, [ORG.demo2]), table).toEqual({ n: 0 });
    }
    // Retried until the server deletes the auth user; then the session row goes with it.
    expect(await q(`select * from public.purge_expired_demo_workspaces(10)`)).toEqual([{ user_id: U.demo2, org_id: ORG.demo2 }]);
    await q(`delete from auth.users where id = $1`, [U.demo2]);
    expect(await q(`select * from public.purge_expired_demo_workspaces(10)`)).toEqual([]);

    expect(await counts(ORG.real)).toEqual(realBefore);
    expect(await one(`select count(*)::int n from public.organizations where id = $1`, [ORG.demo])).toEqual({ n: 1 });
  });

  it("ends a demo on request (End demo) and is idempotent", async () => {
    const id = "d0000000-0000-4000-8000-000000000003";
    const org = (await createDemoVisitor(id)).org_id;
    expect((await one(`select public.purge_demo_workspace($1) as o`, [id])).o).toBe(org);
    expect(await one(`select count(*)::int n from public.organizations where id = $1`, [org])).toEqual({ n: 0 });
    expect((await one(`select public.purge_demo_workspace($1) as o`, [id])).o).toBe(org);
    expect((await one(`select public.purge_demo_workspace($1) as o`, [U.owner])).o).toBeNull();
    await q(`delete from auth.users where id = $1`, [id]);
    expect(await one(`select count(*)::int n from public.organizations where id = $1`, [ORG.real])).toEqual({ n: 1 });
  });

  it("counts only live demo workspaces toward the cap", async () => {
    expect(await one(`select public.demo_active_workspace_count() as n`)).toEqual({ n: 1 });
  });
});
