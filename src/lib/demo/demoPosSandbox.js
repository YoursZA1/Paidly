/**
 * Till, kitchen and table bills for the demo sandbox.
 * Checkout and tab payment settle here. No payment provider is contacted.
 */
import { DEMO_PAYMENT_PROVIDER } from "@shared/demo/demoPayments.js";
import {
  KITCHEN_STATUS,
  ORDER_TYPE,
  TABLE_STATUS,
  deriveTableStatus,
  groupItemsByStation,
  kitchenTicketNumber,
  orderStage,
  paymentState,
  tabBalance,
  tabLabel,
  tabTotals,
} from "@shared/pos/restaurant.js";
import { DEMO_ORG_ID, DEMO_USER_ID, demoDataset, demoTable, touchDemoDataset } from "@/lib/demo/demoSandboxStore.js";

function persistPos() {
  touchDemoDataset();
}

function pos() {
  return demoDataset().pos;
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `c0000001-0000-4000-8000-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(12, "0")}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pathOf(url) {
  try {
    return new URL(url, "https://paidly.local").pathname.replace(/\/$/, "");
  } catch {
    return String(url || "").split("?")[0].replace(/\/$/, "");
  }
}

function queryOf(url) {
  try {
    return new URL(url, "https://paidly.local").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function catalogProducts() {
  return demoTable("services")
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      ...row,
      price: Number(row.price) || 0,
      image_src: null,
    }));
}

function itemsFor(tabId) {
  return pos().items.filter((item) => item.tab_id === tabId && item.status !== "void");
}

function ticketsFor(tabId) {
  return pos().tickets.filter((ticket) => ticket.tab_id === tabId);
}

function portionsFor(tabId) {
  return pos().portions.filter((portion) => portion.tab_id === tabId);
}

function summaryFor(tab) {
  const table = pos().tables.find((row) => row.id === tab.table_id) || null;
  const items = itemsFor(tab.id);
  const tickets = ticketsFor(tab.id);
  const portions = portionsFor(tab.id);
  const totals = tabTotals({ items, discountAmount: tab.discount_amount, serviceChargeRate: tab.service_charge_rate });
  const balance = tabBalance({ total: totals.total, portions });
  const now = new Date();
  return {
    id: tab.id,
    order_number: tab.order_number,
    order_type: tab.order_type,
    status: tab.status,
    table_id: tab.table_id,
    table_name: table?.name || null,
    label: tabLabel(tab, table),
    guests: tab.guests,
    server_name: tab.server_name,
    register_id: tab.register_id || null,
    customer_name: tab.customer_name || null,
    note: tab.note || null,
    opened_at: tab.opened_at,
    closed_at: tab.closed_at || null,
    bill_requested_at: tab.bill_requested_at || null,
    discount_amount: Number(tab.discount_amount) || 0,
    service_charge_rate: Number(tab.service_charge_rate) || 0,
    minutes_open: tab.opened_at ? Math.max(0, Math.floor((now - new Date(tab.opened_at)) / 60000)) : null,
    totals,
    balance,
    table_status: table ? deriveTableStatus({ table, tab, items, tickets, balance }) : null,
    kitchen: {
      live: tickets.filter((t) => t.status === KITCHEN_STATUS.NEW || t.status === KITCHEN_STATUS.PREPARING || t.status === KITCHEN_STATUS.READY).length,
      state: tickets.some((t) => t.status === KITCHEN_STATUS.READY) ? "ready" : tickets.length ? "preparing" : "idle",
    },
    stage: orderStage({ items, tickets }),
    payment_state: paymentState(balance),
    payment_failed: false,
    pending_items: items.filter((i) => i.status === "pending").length,
    sent_items: items.filter((i) => i.status === "sent").length,
  };
}

function bundle(tab) {
  const table = pos().tables.find((row) => row.id === tab.table_id) || null;
  const items = itemsFor(tab.id);
  const tickets = ticketsFor(tab.id);
  return {
    ok: true,
    tab: summaryFor(tab),
    table: table ? { id: table.id, name: table.name, seats: table.seats } : null,
    items: items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      line_total: Math.round((Number(item.unit_price) || 0) * (Number(item.quantity) || 0) * 100) / 100,
      note: item.note || null,
      station: item.station || "kitchen",
      status: item.status,
      round: item.round || 1,
      kitchen_status: item.ticket_id ? tickets.find((t) => t.id === item.ticket_id)?.status || null : null,
    })),
    tickets,
    portions: portionsFor(tab.id),
  };
}

function floorPayload() {
  const openTabs = pos().tabs.filter((tab) => tab.status === "open");
  const tables = pos().tables.map((table) => {
    const tab = openTabs.find((row) => row.table_id === table.id) || null;
    const summary = tab ? summaryFor(tab) : null;
    return {
      ...table,
      status: summary?.table_status || (table.cleaning_since ? TABLE_STATUS.CLEANING : TABLE_STATUS.AVAILABLE),
      tab: summary,
    };
  });
  return {
    ok: true,
    restaurant_enabled: true,
    floors: [{ id: pos().floorId, name: "Dining room", sort_order: 0 }],
    tables,
    takeaway: openTabs.filter((tab) => !tab.table_id).map((tab) => summaryFor(tab)),
  };
}

function productById(id) {
  return demoTable("services").find((row) => row.id === id) || null;
}

function addLines(tab, lines) {
  const round = (itemsFor(tab.id).reduce((max, item) => Math.max(max, item.round || 1), 0) || 0) + 1;
  const created = [];
  for (const line of lines || []) {
    const product = productById(line.product_id);
    const qty = Number(line.quantity) || 1;
    const price = Number(line.unit_price ?? product?.price ?? 0);
    const item = {
      id: newId(),
      tab_id: tab.id,
      product_id: line.product_id || null,
      name: product?.name || line.name || "Item",
      quantity: qty,
      unit_price: price,
      note: line.note || null,
      station: "kitchen",
      status: "pending",
      round,
    };
    pos().items.push(item);
    created.push(item);
  }
  return created;
}

function openTab(body) {
  const table = body.table_id ? pos().tables.find((row) => row.id === body.table_id) : null;
  if (table) {
    const occupied = pos().tabs.find((tab) => tab.status === "open" && tab.table_id === table.id);
    if (occupied) {
      const error = new Error("That table already has an open order");
      error.code = "TABLE_OCCUPIED";
      throw error;
    }
  }
  pos().orderSeq += 1;
  const tab = {
    id: newId(),
    order_number: pos().orderSeq,
    order_type: body.order_type || (table ? ORDER_TYPE.DINE_IN : ORDER_TYPE.COUNTER),
    status: "open",
    table_id: table?.id || null,
    guests: Number(body.guests) || (table ? 2 : 1),
    server_name: body.server_name || "Demo Host",
    register_id: body.register_id || pos().register.id,
    customer_name: body.customer_name || null,
    note: body.note || null,
    opened_at: new Date().toISOString(),
    discount_amount: 0,
    service_charge_rate: 0,
  };
  pos().tabs.push(tab);
  if (Array.isArray(body.items) && body.items.length) addLines(tab, body.items);
  return tab;
}

function sendTab(tab) {
  const pending = pos().items.filter((item) => item.tab_id === tab.id && item.status === "pending");
  const groups = groupItemsByStation(pending);
  const sentTickets = [];
  for (const group of groups) {
    const station = group.station || "kitchen";
    const lines = group.items || [];
    const ticket = {
      id: newId(),
      tab_id: tab.id,
      station,
      status: KITCHEN_STATUS.NEW,
      ticket_number: kitchenTicketNumber(tab.order_number, lines[0]?.round || 1, station, groups.length),
      order_type: tab.order_type,
      table_label: tabLabel(tab, pos().tables.find((row) => row.id === tab.table_id)),
      server_name: tab.server_name,
      sent_at: new Date().toISOString(),
      items: lines.map((line) => ({ id: line.id, name: line.name, quantity: line.quantity, note: line.note })),
    };
    pos().tickets.push(ticket);
    for (const line of lines) {
      line.status = "sent";
      line.ticket_id = ticket.id;
    }
    sentTickets.push(ticket);
  }
  return sentTickets;
}

function receiptNumber() {
  const n = Math.floor(10000 + Math.random() * 89999);
  return `DEMO-${n}`;
}

function recordSale({ total, method, items, reference }) {
  const sale = {
    id: newId(),
    org_id: DEMO_ORG_ID,
    receipt_number: reference || receiptNumber(),
    external_id: newId(),
    status: "completed",
    sale_kind: "sale",
    total_amount: total,
    currency: "ZAR",
    payment_method: method,
    occurred_at: new Date().toISOString(),
    items,
    cashier_id: DEMO_USER_ID,
    register_id: pos().register.id,
    session_id: pos().session.id,
    customer_name: null,
    customer_email: null,
  };
  demoTable("pos_sales_events").unshift(sale);
  if (method === "cash") {
    pos().session.cash_sales = Math.round(((Number(pos().session.cash_sales) || 0) + total) * 100) / 100;
    pos().session.expected_cash = Math.round(((Number(pos().session.expected_cash) || 0) + total) * 100) / 100;
  }
  return sale;
}

function handleTab(body) {
  const action = body.action;
  if (action === "open") {
    const tab = openTab(body);
    persistPos();
    return bundle(tab);
  }
  const tab = pos().tabs.find((row) => row.id === body.tab_id);
  if (!tab) {
    const error = new Error("Order not found");
    error.code = "TAB_NOT_FOUND";
    throw error;
  }
  if (action === "add_items") addLines(tab, body.items);
  if (action === "send") {
    const sent = sendTab(tab);
    persistPos();
    return { ...bundle(tab), sent_tickets: sent };
  }
  if (action === "serve") {
    for (const ticket of ticketsFor(tab.id)) {
      if (ticket.status !== KITCHEN_STATUS.VOID) ticket.status = KITCHEN_STATUS.COMPLETED;
    }
  }
  if (action === "request_bill") tab.bill_requested_at = new Date().toISOString();
  if (action === "mark_clean") {
    const table = pos().tables.find((row) => row.id === (body.table_id || tab.table_id));
    if (table) table.cleaning_since = null;
    tab.status = "closed";
    tab.closed_at = new Date().toISOString();
  }
  if (action === "void" || action === "close") {
    tab.status = action === "void" ? "void" : "closed";
    tab.closed_at = new Date().toISOString();
  }
  if (action === "details") {
    if (body.guests != null) tab.guests = Number(body.guests) || tab.guests;
    if (body.customer_name != null) tab.customer_name = body.customer_name;
    if (body.note != null) tab.note = body.note;
  }
  persistPos();
  return bundle(tab);
}

function handlePay(body) {
  const tab = pos().tabs.find((row) => row.id === body.tab_id);
  if (!tab) throw new Error("Order not found");
  const current = summaryFor(tab);
  const amount = Number(current.balance?.due) || Number(current.totals?.total) || 0;
  const method = body.payment_method || "cash";
  const tendered = method === "cash" ? Number(body.amount_tendered) || amount : amount;
  const portion = {
    id: newId(),
    tab_id: tab.id,
    label: method === "cash" ? "Cash" : method === "digital" ? "EFT" : "Card",
    amount,
    status: "paid",
    provider: "demo",
    payment_method: method,
  };
  pos().portions.push(portion);
  const sale = recordSale({
    total: amount,
    method,
    items: itemsFor(tab.id),
    reference: receiptNumber(),
  });
  const next = bundle(tab);
  persistPos();
  return {
    ...next,
    pending: false,
    portion: { label: portion.label, amount },
    sale,
    change_due: method === "cash" ? Math.max(0, Math.round((tendered - amount) * 100) / 100) : null,
    demo: true,
  };
}

function handleCheckout(body) {
  const method = body.payment_method || "cash";
  const lines = Array.isArray(body.items) ? body.items : [];
  let total = 0;
  const items = lines.map((line) => {
    const product = productById(line.product_id);
    const qty = Number(line.quantity) || 1;
    const price = Number(line.unit_price ?? product?.price ?? 0);
    total += price * qty;
    if (product && product.stock_on_hand != null) {
      product.stock_on_hand = Math.max(0, Number(product.stock_on_hand) - qty);
    }
    return { product_id: line.product_id, name: product?.name || "Item", quantity: qty, unit_price: price };
  });
  total = Math.round(total * 100) / 100;
  const sale = recordSale({ total, method, items, reference: receiptNumber() });
  sale.customer_name = body.customer_name || null;
  sale.customer_email = body.customer_email || null;
  sale.amount_tendered = body.amount_tendered ?? null;
  sale.change_due = method === "cash" && body.amount_tendered != null
    ? Math.max(0, Math.round((Number(body.amount_tendered) - total) * 100) / 100)
    : null;
  persistPos();
  return {
    ok: true,
    pending: false,
    sale,
    payment_intent: {
      id: newId(),
      status: "paid",
      amount: total,
      currency: "ZAR",
      provider: "demo",
      reference: sale.receipt_number,
    },
  };
}

function handleKitchenMove(body) {
  const ticket = pos().tickets.find((row) => row.id === body.ticket_id);
  if (!ticket) throw new Error("Ticket not found");
  ticket.status = body.status || ticket.status;
  if (ticket.status === KITCHEN_STATUS.PREPARING) ticket.accepted_at = new Date().toISOString();
  if (ticket.status === KITCHEN_STATUS.READY) ticket.ready_at = new Date().toISOString();
  persistPos();
  return { ok: true, ticket };
}

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
export async function demoPosResponse(url, init = {}) {
  const path = pathOf(url);
  const method = String(init.method || "GET").toUpperCase();
  let body = {};
  if (init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }
  }
  try {
    if (path.endsWith("/catalog")) {
      return json({
        products: catalogProducts(),
        register_id: pos().register.id,
        company_id: null,
        experience: { restaurant: true, services: true, business_type: "restaurant" },
        card_rail: null,
        digital_provider: DEMO_PAYMENT_PROVIDER,
      });
    }
    if (path.endsWith("/registers")) {
      return json({ registers: [pos().register], members: [] });
    }
    if (path.endsWith("/sessions") && method === "GET") {
      const status = queryOf(url).get("status");
      const rows = status && pos().session.status !== status ? [] : [pos().session];
      return json({ sessions: rows });
    }
    if (path.endsWith("/sessions") && method === "POST") {
      pos().session = {
        ...pos().session,
        id: newId(),
        status: "open",
        register_id: body.register_id || pos().register.id,
        opening_balance: Number(body.opening_balance) || 0,
        expected_cash: Number(body.opening_balance) || 0,
        cash_sales: 0,
        opened_at: new Date().toISOString(),
      };
      persistPos();
      return json({ session: pos().session });
    }
    if (path.includes("/sessions/") && path.endsWith("/close")) {
      pos().session = { ...pos().session, status: "closed", closed_at: new Date().toISOString() };
      persistPos();
      return json({ session: pos().session });
    }
    if (path.endsWith("/checkout") && method === "POST") return json(handleCheckout(body), 201);
    if (path.endsWith("/sales")) {
      const sales = demoTable("pos_sales_events");
      const totalToday = sales.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);
      return json({ sales, total_today: Math.round(totalToday * 100) / 100 });
    }
    if (path.endsWith("/floor")) return json(floorPayload());
    if (path.endsWith("/floor-setup") && method === "GET") {
      return json({ ...floorPayload(), operators: [] });
    }
    if (path.endsWith("/tab") && method === "GET") {
      const tab = pos().tabs.find((row) => row.id === queryOf(url).get("id"));
      if (!tab) return json({ error: "Order not found" }, 404);
      return json(bundle(tab));
    }
    if (path.endsWith("/tab") && method === "POST") return json(handleTab(body));
    if (path.endsWith("/tab-pay") && method === "POST") return json(handlePay(body));
    if (path.endsWith("/kitchen") && method === "GET") {
      return json({ ok: true, tickets: pos().tickets.filter((t) => t.status !== KITCHEN_STATUS.COMPLETED && t.status !== KITCHEN_STATUS.VOID) });
    }
    if (path.endsWith("/kitchen") && method === "POST") return json(handleKitchenMove(body));
    if (path.endsWith("/orders")) {
      const orders = pos().tabs.filter((tab) => tab.status === "open").map((tab) => summaryFor(tab));
      return json({ ok: true, orders, tickets: pos().tickets });
    }
    if (path.endsWith("/connections")) return json({ connections: [] });
    return json({ ok: true });
  } catch (error) {
    return json({ error: error.message, code: error.code || "DEMO_POS" }, error.code === "TAB_NOT_FOUND" ? 404 : 422);
  }
}
