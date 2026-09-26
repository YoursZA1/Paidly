/**
 * Restaurant POS end-to-end through the real handlers, Payment Engine and settlePosIntent
 * (in-memory Supabase). Floor → Table → Tab → rounds → KOT → split bill → sales → close.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { memory, tables, gate, stock } = vi.hoisted(() => {
  const tables = {};
  const matches = (row, f) => {
    const v = row[f.col];
    if (f.op === "eq") return String(v ?? "") === String(f.value ?? "");
    if (f.op === "in") return f.value.map(String).includes(String(v ?? ""));
    if (f.op === "is") return f.value === null ? v == null : v === f.value;
    if (f.op === "gte") return String(v ?? "") >= String(f.value ?? "");
    return true;
  };
  const uniques = {
    pos_tabs: [(row, other) => row.status === "open" && other.status === "open" && row.table_id && row.table_id === other.table_id, (row, other) => row.org_id === other.org_id && row.order_number === other.order_number],
    pos_tab_payments: [(row, other) => row.payment_intent_id === other.payment_intent_id],
    pos_floors: [(row, other) => row.org_id === other.org_id && String(row.name).toLowerCase() === String(other.name).toLowerCase()],
    pos_tables: [(row, other) => row.floor_id === other.floor_id && String(row.name).toLowerCase() === String(other.name).toLowerCase()],
    payment_intents: [(row, other) => row.idempotency_key && row.org_id === other.org_id && row.idempotency_key === other.idempotency_key],
  };
  const violates = (table, row, selfId) =>
    (uniques[table] || []).some((rule) => (tables[table] || []).some((other) => other.id !== selfId && rule(row, other)));
  const memory = {
    from(table) {
      tables[table] ||= [];
      const st = { action: "select", payload: null, filters: [], order: [], limit: null };
      const run = () => {
        if (st.action === "insert") {
          const now = new Date().toISOString();
          const list = Array.isArray(st.payload) ? st.payload : [st.payload];
          const out = [];
          for (const p of list) {
            const rec = { id: randomUUID(), created_at: now, updated_at: now, ...p };
            if (table === "pos_tabs") rec.opened_at ||= now;
            if (table === "pos_kitchen_tickets") rec.sent_at ||= now;
            if (violates(table, rec, null)) return { error: { code: "23505", message: `duplicate key ${table}` } };
            tables[table].push(rec);
            out.push(rec);
          }
          return { data: out };
        }
        let found = tables[table].filter((r) => st.filters.every((f) => matches(r, f)));
        if (st.action === "update") {
          for (const r of found) {
            const next = { ...r, ...st.payload };
            if (violates(table, next, r.id)) return { error: { code: "23505", message: `duplicate key ${table}` } };
          }
          found.forEach((r) => Object.assign(r, st.payload));
          return { data: found };
        }
        if (st.action === "delete") {
          tables[table] = tables[table].filter((r) => !found.includes(r));
          return { data: found };
        }
        for (const { col, asc } of [...st.order].reverse()) {
          found = [...found].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
        }
        return { data: st.limit != null ? found.slice(0, st.limit) : found };
      };
      const api = {
        select: () => api,
        insert: (p) => ((st.action = "insert"), (st.payload = p), api),
        update: (p) => ((st.action = "update"), (st.payload = p), api),
        delete: () => ((st.action = "delete"), api),
        eq: (col, value) => (st.filters.push({ op: "eq", col, value }), api),
        in: (col, value) => (st.filters.push({ op: "in", col, value }), api),
        is: (col, value) => (st.filters.push({ op: "is", col, value }), api),
        gte: (col, value) => (st.filters.push({ op: "gte", col, value }), api),
        order: (col, o) => (st.order.push({ col, asc: o?.ascending !== false }), api),
        limit: (n) => ((st.limit = n), api),
        maybeSingle: async () => {
          const r = run();
          return r.error ? { data: null, error: r.error } : { data: r.data[0] || null, error: null };
        },
        single: async () => {
          const r = run();
          if (r.error) return { data: null, error: r.error };
          return r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { message: "no rows" } };
        },
        then: (res, rej) => {
          const r = run();
          return Promise.resolve(r.error ? { data: null, error: r.error } : { data: r.data, error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
  return { memory, tables, gate: { current: null }, stock: { moves: [] } };
});

vi.mock("../../server/src/supabaseAdmin.js", () => ({ supabaseAdmin: memory }));
vi.mock("../../server/src/pos/posConnectionsRoutes.js", () => ({
  requireOrgMember: async () => gate.current,
  requirePosPermission: async () => gate.current,
  requireSettingsManager: async () => gate.current,
}));
vi.mock("../../server/src/pos/posRegisters.js", () => ({
  resolveCheckoutRegister: async () => ({ ok: true, register: { id: "reg-1", company_id: null } }),
}));
vi.mock("../../server/src/pos/posRegisterSessions.js", () => ({
  resolveOpenSession: async () => ({ ok: true, session: { id: "shift-1" } }),
}));
vi.mock("../../server/src/pos/posInventorySync.js", () => ({
  commitNativePosInventory: async (_db, { saleEventId, items }) => {
    for (const item of items || []) if (item.product_id) stock.moves.push({ saleEventId, product_id: item.product_id, quantity: item.quantity });
    return { applied: true, failed: null, results: [] };
  },
}));
vi.mock("../../server/src/pos/posAudit.js", () => ({
  recordPosAuditEvent: async () => null,
  recordPosAuditEvents: async () => null,
}));

const { dispatchRestaurantRoute } = await import("../../server/src/pos/restaurant/posRestaurantDispatch.js");
const { planBillPortion } = await import("../../server/src/pos/restaurant/posRestaurantRoutes.js");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const P = {
  burger: "aaaaaaaa-0000-4000-8000-000000000001",
  coke: "aaaaaaaa-0000-4000-8000-000000000002",
  capp: "aaaaaaaa-0000-4000-8000-000000000003",
  cake: "aaaaaaaa-0000-4000-8000-000000000004",
  water: "aaaaaaaa-0000-4000-8000-000000000005",
};
const OWNER = { ok: true, user: { id: "owner-1" }, membership: { orgId: ORG, companyRole: "owner" } };
const WAITER = { ok: true, user: { id: "waiter-1" }, membership: { orgId: ORG, companyRole: "pos_cashier", permissions: ["pos_access", "pos_sell"] } };

function res() {
  const r = { statusCode: 200, body: null, headers: {} };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
}

async function call(route, method, { body = {}, query = {}, as = OWNER } = {}) {
  gate.current = as;
  const r = res();
  await dispatchRestaurantRoute(route, { method, body, query, headers: {} }, r);
  return r;
}

const tab = (body, as) => call("restaurant-tab", "POST", { body, as });
const pay = (body, as) => call("restaurant-tab-pay", "POST", { body, as });

function product(id, name, price, station = null) {
  return { id, org_id: ORG, name, item_type: "product", is_active: true, price, stock_quantity: 50, pos_station: station };
}

const savedEnv = {};
beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  stock.moves.length = 0;
  tables.services = [
    product(P.burger, "Chicken Burger", 90, "grill"),
    product(P.coke, "Coke", 25, "bar"),
    product(P.capp, "Cappuccino", 35, "bar"),
    product(P.cake, "Cheesecake", 45),
    product(P.water, "Water", 15, "bar"),
    { ...product("bbbbbbbb-0000-4000-8000-000000000009", "Other org item", 10), org_id: OTHER },
  ];
  tables.organizations = [{ id: ORG, business_type: "restaurant" }];
  tables.pos_connections = [{ id: "conn-1", org_id: ORG, provider: "paidly", status: "active" }];
  for (const k of ["OZOW_SITE_CODE", "OZOW_API_KEY", "OZOW_PRIVATE_KEY"]) savedEnv[k] = process.env[k];
  delete process.env.OZOW_SITE_CODE;
  delete process.env.OZOW_API_KEY;
  delete process.env.OZOW_PRIVATE_KEY;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

async function setupFloor() {
  const floor = await call("restaurant-floor-setup", "POST", { body: { action: "create_floor", name: "Main Floor" } });
  expect(floor.statusCode).toBe(201);
  const t12 = await call("restaurant-floor-setup", "POST", { body: { action: "create_table", floor_id: floor.body.floor.id, name: "12", seats: 4, pos_x: 2, pos_y: 1 } });
  const t4 = await call("restaurant-floor-setup", "POST", { body: { action: "create_table", floor_id: floor.body.floor.id, name: "4", seats: 2 } });
  return { floorId: floor.body.floor.id, t12: t12.body.table, t4: t4.body.table };
}

async function seatTable12WithFirstRound() {
  const { t12, t4 } = await setupFloor();
  const opened = await tab({ action: "open", table_id: t12.id, guests: 4, server_name: "Mando" }, WAITER);
  expect(opened.statusCode).toBe(201);
  const id = opened.body.tab.id;
  await tab(
    {
      action: "add_items",
      tab_id: id,
      items: [
        { product_id: P.burger, quantity: 2, note: "Extra cheese, no onions" },
        { product_id: P.coke, quantity: 1 },
        { product_id: P.capp, quantity: 2, note: "Oat milk" },
        { product_id: P.cake, quantity: 1 },
      ],
    },
    WAITER
  );
  return { id, t12, t4 };
}

describe("floor setup", () => {
  it("creates floors and tables; names are unique per floor; only managers edit", async () => {
    const { floorId } = await setupFloor();
    const dup = await call("restaurant-floor-setup", "POST", { body: { action: "create_table", floor_id: floorId, name: "12" } });
    expect(dup.statusCode).toBe(409);
    const bad = await call("restaurant-floor-setup", "POST", { body: { action: "create_table", floor_id: floorId, name: "X", pos_x: 40 } });
    expect(bad.statusCode).toBe(422);
    const floor = await call("restaurant-floor", "GET");
    expect(floor.body.floors.map((f) => f.name)).toEqual(["Main Floor"]);
    expect(floor.body.tables.map((t) => [t.name, t.status])).toEqual([
      ["12", "available"],
      ["4", "available"],
    ]);
  });
});

describe("one table = one open order, with rounds", () => {
  it("opens a tab on a table and refuses a second open tab on the same table", async () => {
    const { id, t12 } = await seatTable12WithFirstRound();
    const again = await tab({ action: "open", table_id: t12.id }, WAITER);
    expect(again.statusCode).toBe(409);
    expect(again.body).toMatchObject({ code: "TABLE_OCCUPIED", tab_id: id });
  });

  it("prices items from the catalog (not the browser) and rejects other orgs' items", async () => {
    const { id } = await seatTable12WithFirstRound();
    const got = await call("restaurant-tab", "GET", { query: { id } });
    expect(got.body.tab.totals.total).toBe(320);
    expect(got.body.items.every((i) => i.status === "pending")).toBe(true);
    expect(got.body.tab.table_status).toBe("ordering");
    const foreign = await tab({ action: "add_items", tab_id: id, items: [{ product_id: "bbbbbbbb-0000-4000-8000-000000000009", quantity: 1, unit_price: 0 }] }, WAITER);
    expect(foreign.statusCode).toBe(422);
  });

  it("Send to kitchen creates one KOT per station; the next round sends only the new items", async () => {
    const { id } = await seatTable12WithFirstRound();
    const sent = await tab({ action: "send", tab_id: id }, WAITER);
    expect(sent.statusCode).toBe(200);
    const kots = sent.body.sent_tickets;
    expect(kots.map((k) => [k.ticket_number, k.station, k.table_label])).toEqual([
      ["1001-1-GRI", "grill", "Table 12"],
      ["1001-1-BAR", "bar", "Table 12"],
      ["1001-1-KIT", "kitchen", "Table 12"],
    ]);
    expect(kots[0].items).toEqual([{ name: "Chicken Burger", quantity: 2, note: "Extra cheese, no onions" }]);
    expect(sent.body.tab.table_status).toBe("kitchen");

    await tab({ action: "add_items", tab_id: id, items: [{ product_id: P.water, quantity: 2 }] }, WAITER);
    const round2 = await tab({ action: "send", tab_id: id }, WAITER);
    expect(round2.body.sent_tickets).toHaveLength(1);
    expect(round2.body.sent_tickets[0]).toMatchObject({ ticket_number: "1001-2", round: 2, station: "bar" });
    expect(round2.body.sent_tickets[0].items).toEqual([{ name: "Water", quantity: 2, note: null }]);
    expect(round2.body.items.filter((i) => i.round === 1)).toHaveLength(4);

    const nothing = await tab({ action: "send", tab_id: id }, WAITER);
    expect(nothing.body.code).toBe("NOTHING_TO_SEND");
  });

  it("KDS: accept → ready → complete; the table shows Ready", async () => {
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const kds = await call("restaurant-kitchen", "GET", { query: { station: "bar" } });
    expect(kds.body.tickets).toHaveLength(1);
    const ticketId = kds.body.tickets[0].id;
    expect((await call("restaurant-kitchen", "POST", { body: { ticket_id: ticketId, status: "completed" } })).statusCode).toBe(409);
    expect((await call("restaurant-kitchen", "POST", { body: { ticket_id: ticketId, status: "preparing" } })).body.ticket.status).toBe("preparing");
    expect((await call("restaurant-kitchen", "POST", { body: { ticket_id: ticketId, status: "ready" } })).body.ticket.status).toBe("ready");
    const floor = await call("restaurant-floor", "GET");
    expect(floor.body.tables.find((t) => t.name === "12").status).toBe("ready");
    await call("restaurant-kitchen", "POST", { body: { ticket_id: ticketId, status: "completed" } });
    expect((await call("restaurant-kitchen", "GET", { query: { station: "bar" } })).body.tickets).toHaveLength(0);
  });
});

describe("table actions", () => {
  it("transfers to a free table and merges two tables", async () => {
    const { id, t4 } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const moved = await tab({ action: "transfer", tab_id: id, to_table_id: t4.id }, WAITER);
    expect(moved.body.tab.label).toBe("Table 4");
    expect(tables.pos_kitchen_tickets.every((k) => k.table_label === "Table 4")).toBe(true);

    const floor = await call("restaurant-floor", "GET");
    const t12 = floor.body.tables.find((t) => t.name === "12");
    const other = await tab({ action: "open", table_id: t12.id, guests: 2 }, WAITER);
    await tab({ action: "add_items", tab_id: other.body.tab.id, items: [{ product_id: P.coke, quantity: 2 }] }, WAITER);
    const merged = await tab({ action: "merge", tab_id: id, from_tab_id: other.body.tab.id }, WAITER);
    expect(merged.body.tab.totals.total).toBe(370);
    expect(merged.body.tab.guests).toBe(6);
    expect(tables.pos_tabs.find((t) => t.id === other.body.tab.id)).toMatchObject({ status: "void", merged_into: id });
  });

  it("discount needs discount access; voiding a sent item needs manager access", async () => {
    const { id } = await seatTable12WithFirstRound();
    expect((await tab({ action: "discount", tab_id: id, amount: 20 }, WAITER)).statusCode).toBe(403);
    expect((await tab({ action: "discount", tab_id: id, amount: 20 }, OWNER)).body.tab.totals.total).toBe(300);
    await tab({ action: "send", tab_id: id }, WAITER);
    const cake = tables.pos_tab_items.find((i) => i.name === "Cheesecake");
    expect((await tab({ action: "void_item", tab_id: id, item_id: cake.id }, WAITER)).statusCode).toBe(403);
    const voided = await tab({ action: "void_item", tab_id: id, item_id: cake.id, reason: "Dropped" }, OWNER);
    expect(voided.body.tab.totals.subtotal).toBe(275);
    expect(tables.pos_kitchen_tickets.find((k) => k.id === cake.kot_id).status).toBe("void");
  });
});

describe("bill and split payments (Payment Engine → settlePosIntent → sale)", () => {
  it("refuses payment while new items are unsent", async () => {
    const { id } = await seatTable12WithFirstRound();
    const r = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 400 }, WAITER);
    expect(r.body.code).toBe("PENDING_ITEMS");
  });

  it("split equally in cash: each guest is a payment intent and a sale; stock moves once; then close", async () => {
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);

    const g1 = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 100, split: { kind: "equal", parts: 4, part_index: 0 } }, WAITER);
    expect(g1.statusCode).toBe(200);
    expect(g1.body).toMatchObject({ paid: true, change_due: 20, portion: { label: "Guest 1 of 4", amount: 80 } });
    expect(g1.body.tab.balance).toMatchObject({ paid: 80, due: 240 });
    const again = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 80, split: { kind: "equal", parts: 4, part_index: 0 } }, WAITER);
    expect(again.body.code).toBe("SPLIT_PART_PAID");

    // Cannot close with money still owed.
    expect((await tab({ action: "close", tab_id: id }, WAITER)).body.code).toBe("BALANCE_DUE");

    for (const i of [1, 2]) {
      await pay({ tab_id: id, payment_method: "cash", amount_tendered: 80, split: { kind: "equal", parts: 4, part_index: i } }, WAITER);
    }
    expect(stock.moves).toHaveLength(0); // no portion has settled the remainder yet
    const last = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 80, split: { kind: "equal", parts: 4, part_index: 3 } }, WAITER);
    expect(last.body.tab.balance).toMatchObject({ paid: 320, due: 0, settled: true });
    expect(last.body.tab.table_status).toBe("paid");

    // Four canonical payment intents, four sales, stock moved exactly once per item (on the final portion).
    expect(tables.payment_intents).toHaveLength(4);
    expect(tables.payment_intents.every((pi) => pi.status === "paid" && pi.source_kind === "pos" && pi.provider === "cash")).toBe(true);
    expect(tables.pos_sales_events).toHaveLength(4);
    expect(tables.pos_sales_events.every((s) => s.session_id === "shift-1" && s.payment_method === "cash")).toBe(true);
    expect(tables.pos_sales_events.reduce((sum, s) => sum + Number(s.total_amount), 0)).toBe(320);
    expect(tables.pos_sales_events[3].raw_payload).toMatchObject({ origin: "pos_table", settlement: "till", tab_label: "Table 12" });
    expect(stock.moves.map((m) => [m.product_id, m.quantity]).sort()).toEqual(
      [[P.burger, 2], [P.coke, 1], [P.capp, 2], [P.cake, 1]].sort()
    );

    const closed = await tab({ action: "close", tab_id: id }, WAITER);
    expect(closed.body.tab.status).toBe("closed");
    const floor = await call("restaurant-floor", "GET");
    expect(floor.body.tables.find((t) => t.name === "12").status).toBe("cleaning");
    const t12 = floor.body.tables.find((t) => t.name === "12");
    await tab({ action: "mark_clean", table_id: t12.id }, WAITER);
    expect((await call("restaurant-floor", "GET")).body.tables.find((t) => t.name === "12").status).toBe("available");
  });

  it("split by item: each guest's items move with their own sale; the same item cannot be paid twice", async () => {
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const cake = tables.pos_tab_items.find((i) => i.name === "Cheesecake");
    const g4 = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 45, split: { kind: "items", item_ids: [cake.id], label: "Guest 4" } }, WAITER);
    expect(g4.body.portion).toEqual({ label: "Guest 4", amount: 45 });
    expect(stock.moves).toEqual([expect.objectContaining({ product_id: P.cake, quantity: 1 })]);
    const twice = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 45, split: { kind: "items", item_ids: [cake.id] } }, WAITER);
    expect(twice.body.code).toBe("SPLIT_ITEMS_PAID");
    const rest = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 500 }, WAITER);
    expect(rest.body.portion).toEqual({ label: "Remaining balance", amount: 275 });
    expect(rest.body.tab.balance.settled).toBe(true);
    expect(stock.moves.filter((m) => m.product_id === P.cake)).toHaveLength(1);
  });

  it("split by amount cannot exceed what is still due", async () => {
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const tooMuch = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 999, split: { kind: "amount", amount: 400 } }, WAITER);
    expect(tooMuch.body.code).toBe("SPLIT_AMOUNT_TOO_HIGH");
    const part = await pay({ tab_id: id, payment_method: "cash", amount_tendered: 100, split: { kind: "amount", amount: 100 } }, WAITER);
    expect(part.body.tab.balance.due).toBe(220);
  });

  it("digital payment with no provider connected fails cleanly and opens no intent", async () => {
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const r = await pay({ tab_id: id, payment_method: "digital" }, WAITER);
    expect(r.statusCode).toBe(422);
    expect(r.body.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(tables.payment_intents || []).toHaveLength(0);
  });

  it("digital payment via the configured provider waits for the webhook (never paid on redirect)", async () => {
    process.env.OZOW_SITE_CODE = "TSTSTE0001";
    process.env.OZOW_API_KEY = "k";
    process.env.OZOW_PRIVATE_KEY = "p";
    const { id } = await seatTable12WithFirstRound();
    await tab({ action: "send", tab_id: id }, WAITER);
    const r = await pay({ tab_id: id, payment_method: "digital" }, WAITER);
    expect(r.statusCode).toBe(202);
    expect(r.body.next_action.type).toBe("redirect");
    const success = new URL(new URL(r.body.next_action.redirect_url).searchParams.get("SuccessUrl"));
    expect(success.searchParams.get("tab")).toBe(id);
    expect(tables.payment_intents[0].status).toBe("requires_action");
    expect(tables.pos_sales_events || []).toHaveLength(0);
    const got = await call("restaurant-tab", "GET", { query: { id } });
    expect(got.body.tab.table_status).toBe("payment_pending");
    expect((await tab({ action: "close", tab_id: id }, WAITER)).body.code).toBe("BALANCE_DUE");
  });

  it("card-present is refused like the counter till", async () => {
    const { id } = await seatTable12WithFirstRound();
    const r = await pay({ tab_id: id, payment_method: "card" }, WAITER);
    expect(r.body.code).toBe("POS_CARD_UNAVAILABLE");
  });
});

describe("planBillPortion", () => {
  it("only the portion that settles the remainder carries the uncarried items", () => {
    const items = [
      { id: "a", status: "sent", quantity: 1, unit_price: 60, product_id: "p1" },
      { id: "b", status: "sent", quantity: 1, unit_price: 40, product_id: "p2" },
    ];
    const bundle = (portions = []) => ({
      tab: { discount_amount: 0, service_charge_rate: 0 },
      items,
      portions,
      summary: {
        totals: { total: 100, subtotal: 100 },
        balance: {
          available: 100 - portions.reduce((s, p) => s + p.amount, 0),
          paid: portions.reduce((s, p) => s + p.amount, 0),
          pending: 0,
        },
      },
    });
    expect(planBillPortion(bundle(), { kind: "amount", amount: 30 }).carried).toEqual([]);
    const final = planBillPortion(bundle([{ amount: 30, status: "paid", allocation: { carried_item_ids: [] } }]), { kind: "full" });
    expect(final.amount).toBe(70);
    expect(final.carried.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("orders screen", () => {
  it("lists live dine-in, takeaway and today's completed orders", async () => {
    const { id } = await seatTable12WithFirstRound();
    const takeaway = await tab({ action: "open", order_type: "takeaway", customer_name: "Sam" }, WAITER);
    expect(takeaway.body.tab.label).toBe(`Takeaway #${takeaway.body.tab.order_number}`);
    const orders = await call("restaurant-orders", "GET");
    expect(orders.body.live.map((o) => o.id)).toEqual([id]);
    expect(orders.body.takeaway.map((o) => o.customer_name)).toEqual(["Sam"]);
    expect(orders.body.completed).toEqual([]);
  });
});
