/**
 * Paidly POS restaurant mode API (V1).
 *
 *   GET  /api/pos/floor                 floors + tables with live status (the floor plan)
 *   POST /api/pos/floor-setup           floors/tables CRUD (company settings managers)
 *   GET  /api/pos/tab?id=               one running table order (items by round, kitchen, bill)
 *   POST /api/pos/tab                   { action: open | add_items | update_item | void_item | send |
 *                                         details | discount | service_charge | request_bill |
 *                                         transfer | merge | serve | close | void | mark_clean }
 *   POST /api/pos/tab-pay               pay the bill or one split portion (Payment Engine)
 *   GET  /api/pos/kitchen               live kitchen tickets (KDS), optional ?station=
 *   POST /api/pos/kitchen               { ticket_id, status } (accept → ready → complete)
 *   GET  /api/pos/orders                open orders (dine-in, takeaway, counter) with stage + payment
 *                                       state, the live kitchen queue, and today's completed orders
 *
 * Money: a bill portion is a payment_intent (source pos) with a checkout snapshot. Cash settles on
 * the till; online providers settle by verified webhook. Either way settlePosIntent writes the
 * pos_sales_events row and moves stock — this module never writes a sale or marks anything paid.
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "../../supabaseAdmin.js";
import { PERMISSIONS, forbidUnlessPermission, membershipHasPermission } from "../../companyRouteAccess.js";
import { isValidUuid } from "../../inputValidation.js";
import { membershipCanEnterPos } from "../../../../shared/posStaffInvite.js";
import { roundMoney, catalogUnitPrice } from "../posCheckoutMath.js";
import { resolveCheckoutRegister } from "../posRegisters.js";
import { resolveOpenSession } from "../posRegisterSessions.js";
import { saleCompanyIdFromRegister } from "../posCatalogScope.js";
import { ensureNativePosConnection, loadPosCatalogRows, salePublicView } from "../posNativeCheckout.js";
import { recordPosAuditEvent } from "../posAudit.js";
import { loadOrgPosExperience } from "../posBusinessType.js";
import { POS_AUDIT_ACTOR, posAuditCancellation } from "../posAuditMath.js";
import {
  confirmCustomerPaymentIntent,
  createCustomerPaymentIntent,
  publicPaymentIntentView,
  resolvePosTenderProvider,
  settleTillCashIntent,
} from "../../payments/paymentEngine.js";
import { CUSTOMER_PAYMENT_PROVIDERS, isTillCashSettlement } from "../../payments/paymentIntentContract.js";
import { settlePosIntent } from "../../paidlyPay/settlePosIntent.js";
import { resolvePaidlyPayOrigin } from "../../../../shared/payments/paidlyPayContract.js";
import {
  DEFAULT_STATION,
  KITCHEN_STATUS,
  ORDER_TYPE,
  PAYMENT_STATE,
  TABLE_STATUS,
  canMoveKitchenTicket,
  deriveTableStatus,
  groupItemsByStation,
  itemsShare,
  kitchenTicketNumber,
  normalizeStation,
  orderStage,
  paymentState,
  splitEqually,
  tabBalance,
  tabLabel,
  tabTotals,
} from "../../../../shared/pos/restaurant.js";
import { isDemoNextAction } from "../../../../shared/demo/demoPayments.js";

const MAX_ITEMS_PER_ADD = 100;
const MAX_QTY = 999;
const ACTIVE_INTENT = new Set(["pending", "requires_action", "processing"]);
const LIVE_KITCHEN = [KITCHEN_STATUS.NEW, KITCHEN_STATUS.PREPARING, KITCHEN_STATUS.READY];

export const RESTAURANT_MIGRATION = "supabase/migrations/20260927100000_pos_restaurant_tables.sql";
export const COUNTER_ORDERS_MIGRATION = "supabase/migrations/20260927140000_pos_counter_orders.sql";
const FAILED_INTENT = new Set(["failed", "cancelled", "expired"]);
const ORDER_TYPES = new Set(Object.values(ORDER_TYPE));

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isMissingSchema(message) {
  return /pos_floors|pos_tables|pos_tabs|pos_tab_items|pos_kitchen_tickets|pos_tab_payments|pos_station/i.test(String(message || "")) &&
    /schema cache|does not exist|could not find/i.test(String(message || ""));
}

function sendError(res, err) {
  if (err?.status) return jsonError(res, err.status, err.message, { code: err.code });
  if (isMissingSchema(err?.message)) {
    return jsonError(res, 503, `Restaurant POS tables are missing. Run ${RESTAURANT_MIGRATION} in the Supabase SQL Editor.`, {
      code: "RESTAURANT_SCHEMA_MISSING",
    });
  }
  console.error("[pos-restaurant]", err?.message || err);
  return jsonError(res, 500, err?.message || "Restaurant POS request failed");
}

function cleanText(value, max = 200) {
  const text = String(value ?? "").trim().slice(0, max);
  return text || null;
}

function intOrNull(value, { min = 0, max = 999 } = {}) {
  if (value == null || value === "") return null;
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function ensure(result) {
  if (result.error) throw result.error;
  return result.data;
}

// ── Loading ─────────────────────────────────────────────────────────────────────────

async function loadIntentsById(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = ensure(
    await supabaseAdmin.from("payment_intents").select("id, status, amount, currency, provider, metadata, pos_sale_event_id").in("id", unique)
  );
  return new Map((rows || []).map((row) => [row.id, row]));
}

/** Items, tickets and bill portions for a set of tabs, grouped by tab id. */
async function loadTabChildren(orgId, tabIds) {
  const ids = [...new Set(tabIds.filter(Boolean))];
  const empty = { items: new Map(), tickets: new Map(), portions: new Map() };
  if (!ids.length) return empty;
  const [items, tickets, payments] = await Promise.all([
    supabaseAdmin.from("pos_tab_items").select("*").eq("org_id", orgId).in("tab_id", ids).order("created_at", { ascending: true }),
    supabaseAdmin.from("pos_kitchen_tickets").select("*").eq("org_id", orgId).in("tab_id", ids).order("sent_at", { ascending: true }),
    supabaseAdmin.from("pos_tab_payments").select("*").eq("org_id", orgId).in("tab_id", ids).order("created_at", { ascending: true }),
  ]);
  const intents = await loadIntentsById((ensure(payments) || []).map((p) => p.payment_intent_id));
  const group = (rows, key = "tab_id") => {
    const map = new Map();
    for (const row of rows || []) {
      if (!map.has(row[key])) map.set(row[key], []);
      map.get(row[key]).push(row);
    }
    return map;
  };
  const portionRows = (ensure(payments) || []).map((p) => {
    const intent = intents.get(p.payment_intent_id) || null;
    return {
      id: p.id,
      tab_id: p.tab_id,
      payment_intent_id: p.payment_intent_id,
      label: p.label,
      split_kind: p.split_kind,
      allocation: p.allocation || {},
      amount: Number(intent?.amount) || 0,
      status: intent?.status || "pending",
      provider: intent?.provider || null,
      sale_id: intent?.pos_sale_event_id || null,
      created_at: p.created_at,
    };
  });
  return { items: group(ensure(items)), tickets: group(ensure(tickets)), portions: group(portionRows) };
}

function summarizeTab(tab, { table = null, items = [], tickets = [], portions = [], now = new Date() } = {}) {
  const totals = tabTotals({ items, discountAmount: tab.discount_amount, serviceChargeRate: tab.service_charge_rate });
  const balance = tabBalance({ total: totals.total, portions });
  const status = table ? deriveTableStatus({ table, tab, items, tickets, balance }) : null;
  const liveTickets = tickets.filter((t) => LIVE_KITCHEN.includes(t.status));
  const waiting = liveTickets.filter((t) => t.status === KITCHEN_STATUS.NEW || t.status === KITCHEN_STATUS.PREPARING);
  const lastPortion = portions[portions.length - 1] || null;
  const payState = paymentState(balance);
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
    server_membership_id: tab.server_membership_id || null,
    register_id: tab.register_id || null,
    register_session_id: tab.register_session_id || null,
    customer_name: tab.customer_name,
    note: tab.note,
    opened_at: tab.opened_at,
    closed_at: tab.closed_at,
    bill_requested_at: tab.bill_requested_at,
    discount_amount: Number(tab.discount_amount) || 0,
    service_charge_rate: Number(tab.service_charge_rate) || 0,
    minutes_open: tab.opened_at ? Math.max(0, Math.floor((now - new Date(tab.opened_at)) / 60000)) : null,
    totals,
    balance,
    table_status: status,
    kitchen: {
      live: liveTickets.length,
      ready: liveTickets.filter((t) => t.status === KITCHEN_STATUS.READY).length,
      waiting: waiting.length,
      oldest_waiting_at: waiting.reduce((min, t) => (!min || String(t.sent_at) < min ? t.sent_at : min), null),
      ready_at: liveTickets.filter((t) => t.status === KITCHEN_STATUS.READY).reduce((min, t) => (!min || String(t.ready_at) < min ? t.ready_at : min), null),
      state: liveTickets.some((t) => t.status === KITCHEN_STATUS.READY)
        ? "ready"
        : liveTickets.length
          ? "preparing"
          : "idle",
    },
    stage: orderStage({ items, tickets }),
    payment_state: payState,
    // The latest payment attempt failed / was cancelled and nothing covers the bill yet.
    payment_failed: payState !== PAYMENT_STATE.PAID && Boolean(lastPortion && FAILED_INTENT.has(lastPortion.status)),
    pending_items: items.filter((i) => i.status === "pending").length,
    sent_items: items.filter((i) => i.status === "sent").length,
  };
}

async function loadTabBundle(orgId, tabId) {
  if (!isValidUuid(tabId)) throw httpError(422, "Tab id is required", "TAB_REQUIRED");
  const tab = ensure(await supabaseAdmin.from("pos_tabs").select("*").eq("org_id", orgId).eq("id", tabId).maybeSingle());
  if (!tab) throw httpError(404, "Order not found", "TAB_NOT_FOUND");
  const table = tab.table_id
    ? ensure(await supabaseAdmin.from("pos_tables").select("*").eq("org_id", orgId).eq("id", tab.table_id).maybeSingle())
    : null;
  const children = await loadTabChildren(orgId, [tab.id]);
  const items = children.items.get(tab.id) || [];
  const tickets = children.tickets.get(tab.id) || [];
  const portions = children.portions.get(tab.id) || [];
  return { tab, table, items, tickets, portions, summary: summarizeTab(tab, { table, items, tickets, portions }) };
}

function publicBundle(bundle) {
  const ticketsById = new Map(bundle.tickets.map((t) => [t.id, t]));
  return {
    tab: bundle.summary,
    table: bundle.table ? { id: bundle.table.id, name: bundle.table.name, seats: bundle.table.seats } : null,
    items: bundle.items.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      line_total: roundMoney((Number(item.unit_price) || 0) * (Number(item.quantity) || 0)),
      note: item.note,
      station: item.station,
      status: item.status,
      round: item.round,
      kitchen_status: item.kot_id ? ticketsById.get(item.kot_id)?.status || null : null,
    })),
    tickets: bundle.tickets.map(publicTicket),
    portions: bundle.portions,
  };
}

function publicTicket(ticket, items = null) {
  return {
    id: ticket.id,
    tab_id: ticket.tab_id,
    ticket_number: ticket.ticket_number,
    round: ticket.round,
    station: ticket.station,
    status: ticket.status,
    table_label: ticket.table_label,
    order_type: ticket.order_type,
    server_name: ticket.server_name,
    note: ticket.note,
    sent_at: ticket.sent_at,
    accepted_at: ticket.accepted_at,
    ready_at: ticket.ready_at,
    completed_at: ticket.completed_at,
    ...(items ? { items } : {}),
  };
}

// ── Operators (memberships) ─────────────────────────────────────────────────────────

/** Display names for memberships: profile name, else invited name/email (code-only staff). */
async function loadMemberNames(orgId, membershipIds) {
  const ids = [...new Set((membershipIds || []).filter((id) => isValidUuid(id)))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("id, user_id, invited_name, invited_email")
    .eq("org_id", orgId)
    .in("id", ids);
  if (error) return new Map();
  const userIds = (data || []).map((m) => m.user_id).filter(Boolean);
  const profiles = new Map();
  if (userIds.length) {
    const { data: rows } = await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds);
    for (const p of rows || []) profiles.set(p.id, p.full_name || p.email || null);
  }
  return new Map((data || []).map((m) => [m.id, profiles.get(m.user_id) || m.invited_name || m.invited_email || "Staff"]));
}

/** Staff who can work the till in this business — the choices for table assignment. */
async function loadPosOperators(orgId) {
  let { data, error } = await supabaseAdmin
    .from("memberships")
    .select("id, user_id, role, job_function, pos_register_id, disabled_at, pos_access_disabled_at")
    .eq("org_id", orgId);
  if (error && /pos_access_disabled_at/i.test(error.message || "")) {
    ({ data, error } = await supabaseAdmin.from("memberships").select("id, user_id, role, job_function, pos_register_id, disabled_at").eq("org_id", orgId));
  }
  if (error) return [];
  const eligible = (data || []).filter(
    (m) =>
      !m.disabled_at &&
      !m.pos_access_disabled_at &&
      membershipCanEnterPos({ companyRole: m.role, job_function: m.job_function, pos_register_id: m.pos_register_id })
  );
  const names = await loadMemberNames(orgId, eligible.map((m) => m.id));
  return eligible.map((m) => ({ id: m.id, name: names.get(m.id) || "Staff" })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Floor plan ──────────────────────────────────────────────────────────────────────

async function loadFloorState(orgId) {
  const [floors, tables, tabs] = await Promise.all([
    supabaseAdmin.from("pos_floors").select("*").eq("org_id", orgId).order("sort_order", { ascending: true }).order("created_at"),
    supabaseAdmin.from("pos_tables").select("*").eq("org_id", orgId).eq("is_active", true).order("name"),
    supabaseAdmin.from("pos_tabs").select("*").eq("org_id", orgId).eq("status", "open"),
  ]);
  const openTabs = ensure(tabs) || [];
  const children = await loadTabChildren(orgId, openTabs.map((t) => t.id));
  const tabByTable = new Map(openTabs.filter((t) => t.table_id).map((t) => [t.table_id, t]));
  const now = new Date();
  const tableList = ensure(tables) || [];
  const names = await loadMemberNames(orgId, [
    ...tableList.map((t) => t.assigned_membership_id),
    ...openTabs.map((t) => t.server_membership_id),
  ]);
  const tableRows = tableList.map((table) => {
    const tab = tabByTable.get(table.id) || null;
    const summary = tab
      ? summarizeTab(tab, {
          table,
          items: children.items.get(tab.id) || [],
          tickets: children.tickets.get(tab.id) || [],
          portions: children.portions.get(tab.id) || [],
          now,
        })
      : null;
    return {
      id: table.id,
      floor_id: table.floor_id,
      name: table.name,
      seats: table.seats,
      shape: table.shape,
      pos_x: table.pos_x,
      pos_y: table.pos_y,
      assigned_membership_id: table.assigned_membership_id || null,
      assigned_name: table.assigned_membership_id ? names.get(table.assigned_membership_id) || null : null,
      status: summary ? summary.table_status : table.cleaning_since ? TABLE_STATUS.CLEANING : TABLE_STATUS.AVAILABLE,
      tab: summary ? { ...summary, server_display: names.get(tab.server_membership_id) || summary.server_name || null } : null,
    };
  });
  const takeaway = openTabs
    .filter((t) => !t.table_id)
    .map((tab) =>
      summarizeTab(tab, {
        items: children.items.get(tab.id) || [],
        tickets: children.tickets.get(tab.id) || [],
        portions: children.portions.get(tab.id) || [],
        now,
      })
    );
  return {
    floors: (ensure(floors) || []).map((f) => ({ id: f.id, name: f.name, sort_order: f.sort_order })),
    tables: tableRows,
    takeaway,
  };
}

export async function handleRestaurantFloor(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_ACCESS)) return;
  try {
    const [state, experience] = await Promise.all([loadFloorState(gate.membership.orgId), loadOrgPosExperience(gate.membership.orgId)]);
    return res.status(200).json({ ok: true, restaurant_enabled: experience.restaurant, ...state });
  } catch (err) {
    return sendError(res, err);
  }
}

// ── Floor setup (company settings managers) ────────────────────────────────────────

/** GET /api/pos/floor-setup — floor plan plus the staff who can be assigned to tables. */
export async function handleRestaurantSetupGet(req, res, gate) {
  try {
    const orgId = gate.membership.orgId;
    const [state, operators] = await Promise.all([loadFloorState(orgId), loadPosOperators(orgId)]);
    return res.status(200).json({ ok: true, ...state, operators });
  } catch (err) {
    return sendError(res, err);
  }
}

function parseTableWrite(body, { partial }) {
  const out = {};
  if (!partial || body.name !== undefined) {
    const name = cleanText(body.name, 40);
    if (!name) throw httpError(422, "Table name is required", "TABLE_NAME_REQUIRED");
    out.name = name;
  }
  if (!partial || body.seats !== undefined) {
    const seats = intOrNull(body.seats ?? 2, { min: 1, max: 99 });
    if (seats == null) throw httpError(422, "Seats must be between 1 and 99", "TABLE_SEATS_INVALID");
    out.seats = seats;
  }
  if (body.shape !== undefined) {
    if (!["square", "round", "long"].includes(body.shape)) throw httpError(422, "Shape must be square, round or long", "TABLE_SHAPE_INVALID");
    out.shape = body.shape;
  }
  if (body.assigned_membership_id !== undefined) {
    const id = body.assigned_membership_id ? String(body.assigned_membership_id).trim() : null;
    if (id && !isValidUuid(id)) throw httpError(422, "Choose a staff member from this business", "TABLE_ASSIGNEE_INVALID");
    out.assigned_membership_id = id;
  }
  for (const key of ["pos_x", "pos_y"]) {
    if (body[key] !== undefined) {
      const v = intOrNull(body[key], { min: 0, max: 23 });
      if (v == null) throw httpError(422, "Table position is outside the floor grid", "TABLE_POSITION_INVALID");
      out[key] = v;
    }
  }
  return out;
}

async function assertOrgRow(table, orgId, id, label) {
  if (!isValidUuid(id)) throw httpError(422, `${label} id is required`, `${label.toUpperCase()}_REQUIRED`);
  const row = ensure(await supabaseAdmin.from(table).select("*").eq("org_id", orgId).eq("id", id).maybeSingle());
  if (!row) throw httpError(404, `${label} not found`, `${label.toUpperCase()}_NOT_FOUND`);
  return row;
}

function uniqueViolation(err, message, code) {
  if (err?.code === "23505") return httpError(409, message, code);
  return err;
}

export async function handleRestaurantSetup(req, res, gate) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;
  const now = new Date().toISOString();
  try {
    // Building the floor plan is a restaurant feature; tidying up (delete / edit) stays allowed.
    if (["create_floor", "create_table"].includes(String(body.action || ""))) await assertRestaurantBusiness(orgId);
    switch (String(body.action || "")) {
      case "create_floor": {
        const name = cleanText(body.name, 40);
        if (!name) throw httpError(422, "Floor name is required", "FLOOR_NAME_REQUIRED");
        const { data, error } = await supabaseAdmin
          .from("pos_floors")
          .insert({ org_id: orgId, name, sort_order: intOrNull(body.sort_order, { max: 999 }) ?? 0, created_by: gate.user.id })
          .select("*")
          .single();
        if (error) throw uniqueViolation(error, "A floor with that name already exists", "FLOOR_NAME_TAKEN");
        return res.status(201).json({ ok: true, floor: data });
      }
      case "update_floor": {
        await assertOrgRow("pos_floors", orgId, body.id, "Floor");
        const patch = { updated_at: now };
        if (body.name !== undefined) {
          patch.name = cleanText(body.name, 40);
          if (!patch.name) throw httpError(422, "Floor name is required", "FLOOR_NAME_REQUIRED");
        }
        if (body.sort_order !== undefined) patch.sort_order = intOrNull(body.sort_order, { max: 999 }) ?? 0;
        const { data, error } = await supabaseAdmin.from("pos_floors").update(patch).eq("org_id", orgId).eq("id", body.id).select("*").single();
        if (error) throw uniqueViolation(error, "A floor with that name already exists", "FLOOR_NAME_TAKEN");
        return res.status(200).json({ ok: true, floor: data });
      }
      case "delete_floor": {
        await assertOrgRow("pos_floors", orgId, body.id, "Floor");
        const tables = ensure(await supabaseAdmin.from("pos_tables").select("id").eq("org_id", orgId).eq("floor_id", body.id));
        const tableIds = (tables || []).map((t) => t.id);
        if (tableIds.length) {
          const open = ensure(await supabaseAdmin.from("pos_tabs").select("id").eq("org_id", orgId).eq("status", "open").in("table_id", tableIds));
          if ((open || []).length) throw httpError(409, "Close the open tables on this floor first", "FLOOR_HAS_OPEN_TABLES");
        }
        ensure(await supabaseAdmin.from("pos_floors").delete().eq("org_id", orgId).eq("id", body.id));
        return res.status(200).json({ ok: true });
      }
      case "create_table": {
        await assertOrgRow("pos_floors", orgId, body.floor_id, "Floor");
        const fields = parseTableWrite(body, { partial: false });
        if (fields.assigned_membership_id) await assertOrgRow("memberships", orgId, fields.assigned_membership_id, "Staff member");
        const { data, error } = await supabaseAdmin
          .from("pos_tables")
          .insert({ org_id: orgId, floor_id: body.floor_id, is_active: true, created_by: gate.user.id, ...fields })
          .select("*")
          .single();
        if (error) throw uniqueViolation(error, "A table with that name already exists on this floor", "TABLE_NAME_TAKEN");
        return res.status(201).json({ ok: true, table: data });
      }
      case "update_table": {
        await assertOrgRow("pos_tables", orgId, body.id, "Table");
        const fields = parseTableWrite(body, { partial: true });
        if (fields.assigned_membership_id) await assertOrgRow("memberships", orgId, fields.assigned_membership_id, "Staff member");
        if (body.floor_id !== undefined) {
          await assertOrgRow("pos_floors", orgId, body.floor_id, "Floor");
          fields.floor_id = body.floor_id;
        }
        const { data, error } = await supabaseAdmin
          .from("pos_tables")
          .update({ ...fields, updated_at: now })
          .eq("org_id", orgId)
          .eq("id", body.id)
          .select("*")
          .single();
        if (error) throw uniqueViolation(error, "A table with that name already exists on this floor", "TABLE_NAME_TAKEN");
        return res.status(200).json({ ok: true, table: data });
      }
      case "delete_table": {
        await assertOrgRow("pos_tables", orgId, body.id, "Table");
        const open = ensure(await supabaseAdmin.from("pos_tabs").select("id").eq("org_id", orgId).eq("status", "open").eq("table_id", body.id));
        if ((open || []).length) throw httpError(409, "Close this table's open order first", "TABLE_HAS_OPEN_ORDER");
        // Soft delete keeps history on closed tabs readable.
        ensure(await supabaseAdmin.from("pos_tables").update({ is_active: false, updated_at: now }).eq("org_id", orgId).eq("id", body.id));
        return res.status(200).json({ ok: true });
      }
      default:
        return jsonError(res, 422, "Unknown setup action", { code: "UNKNOWN_ACTION" });
    }
  } catch (err) {
    return sendError(res, err);
  }
}

/**
 * Hospitality features follow the business type (Restaurant / café / bar). Other POS types can still
 * read, pay and close orders opened earlier — switching type never strands money — but cannot start
 * new table orders or build floors.
 */
async function assertRestaurantBusiness(orgId) {
  const experience = await loadOrgPosExperience(orgId);
  if (!experience.restaurant) {
    throw httpError(
      403,
      "Tables, kitchen tickets and dine-in orders are for Restaurant / café / bar businesses. Change the business type in Settings → Company profile to use them.",
      "RESTAURANT_NOT_ENABLED"
    );
  }
}

// ── Tabs ───────────────────────────────────────────────────────────────────────────

async function nextOrderNumber(orgId) {
  const rows = ensure(
    await supabaseAdmin.from("pos_tabs").select("order_number").eq("org_id", orgId).order("order_number", { ascending: false }).limit(1)
  );
  return (Number(rows?.[0]?.order_number) || 1000) + 1;
}

async function openTab(gate, body) {
  const orgId = gate.membership.orgId;
  const orderType = ORDER_TYPES.has(body.order_type) ? body.order_type : ORDER_TYPE.DINE_IN;
  let table = null;
  if (orderType === ORDER_TYPE.DINE_IN) {
    table = await assertOrgRow("pos_tables", orgId, body.table_id, "Table");
    if (!table.is_active) throw httpError(422, "This table is no longer in use", "TABLE_INACTIVE");
  }
  const resolved = await resolveCheckoutRegister(orgId, gate.user.id, cleanText(body.register_id, 64), gate.membership).catch(() => null);
  const register = resolved?.ok ? resolved.register : null;
  // Shift attribution: the register's open session (if any) when the order is opened.
  let registerSessionId = null;
  if (register?.id) {
    const shift = await resolveOpenSession(orgId, register.id).catch(() => null);
    registerSessionId = shift?.ok ? shift.session?.id || null : null;
  }
  // Operator attribution comes from the authenticated session, never from the browser.
  let sessionName = gate.posAccess ? gate.user?.user_metadata?.full_name || null : null;
  if (!sessionName && gate.posAccess && gate.membership?.id) {
    sessionName = (await loadMemberNames(orgId, [gate.membership.id])).get(gate.membership.id) || null;
  }
  const base = {
    org_id: orgId,
    company_id: saleCompanyIdFromRegister(register),
    register_id: register?.id || null,
    table_id: table?.id || null,
    order_type: orderType,
    status: "open",
    guests: intOrNull(body.guests, { min: 1, max: 999 }),
    server_id: gate.user?.id || null,
    server_membership_id: gate.membership?.id || null,
    register_session_id: registerSessionId,
    server_name: sessionName || cleanText(body.server_name, 120),
    customer_name: cleanText(body.customer_name, 120),
    note: cleanText(body.note, 500),
    created_by: gate.user?.id || null,
  };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let { data, error } = await supabaseAdmin
      .from("pos_tabs")
      .insert({ ...base, order_number: await nextOrderNumber(orgId) })
      .select("*")
      .single();
    if (error && /server_membership_id|register_session_id/i.test(error.message || "")) {
      // Operator-access migration not applied yet — open the order without the new attribution columns.
      delete base.server_membership_id;
      delete base.register_session_id;
      ({ data, error } = await supabaseAdmin.from("pos_tabs").insert({ ...base, order_number: await nextOrderNumber(orgId) }).select("*").single());
    }
    if (!error) {
      if (table?.cleaning_since) {
        await supabaseAdmin.from("pos_tables").update({ cleaning_since: null }).eq("id", table.id);
      }
      return data;
    }
    if (error.code === "23514" && orderType === ORDER_TYPE.COUNTER && /order_type/i.test(error.message || "")) {
      throw httpError(503, "Counter kitchen orders need the latest Paidly database update. Takeaway works in the meantime.", "COUNTER_ORDERS_UNAVAILABLE");
    }
    if (error.code !== "23505") throw error;
    // Either the table already has an open order (one table = one open order) or another till took
    // this order number. Check the table rather than parsing the constraint name.
    if (table) {
      const existing = ensure(
        await supabaseAdmin.from("pos_tabs").select("id").eq("org_id", orgId).eq("table_id", table.id).eq("status", "open").maybeSingle()
      );
      if (existing?.id) {
        const err = httpError(409, `${tabLabel(null, table)} already has an open order`, "TABLE_OCCUPIED");
        err.tabId = existing.id;
        throw err;
      }
    }
    // order_number race — retry with the next number.
  }
  throw httpError(409, "Could not allocate an order number. Try again.", "ORDER_NUMBER_BUSY");
}

async function loadStations(orgId, productIds) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabaseAdmin.from("services").select("id, pos_station").eq("org_id", orgId).in("id", ids);
  if (error) {
    if (/pos_station/i.test(error.message || "")) return new Map();
    throw error;
  }
  return new Map((data || []).map((row) => [row.id, normalizeStation(row.pos_station)]));
}

function assertOpen(bundle) {
  if (bundle.tab.status !== "open") throw httpError(409, "This order is closed", "TAB_CLOSED");
}

function hasMoneyPortions(bundle) {
  return bundle.portions.some((p) => p.status === "paid" || ACTIVE_INTENT.has(p.status));
}

async function addItems(gate, bundle, body) {
  assertOpen(bundle);
  const orgId = gate.membership.orgId;
  const requested = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS_PER_ADD) : [];
  if (!requested.length) throw httpError(422, "Add at least one item", "ITEMS_REQUIRED");
  const productIds = requested.map((r) => String(r?.product_id || "").trim());
  if (productIds.some((id) => !isValidUuid(id))) throw httpError(422, "Each item needs a product", "PRODUCT_REQUIRED");

  const catalog = new Map(
    (await loadPosCatalogRows(orgId, { productIds, registerCompanyId: bundle.tab.company_id, enforceBrand: true })).map((row) => [row.id, row])
  );
  const stations = await loadStations(orgId, productIds);
  const rows = [];
  for (const raw of requested) {
    const product = catalog.get(String(raw.product_id).trim());
    if (!product) throw httpError(422, "One or more items are not on this menu", "PRODUCT_NOT_IN_CATALOG");
    if (product.is_active === false) throw httpError(422, `${product.name || "Item"} is not available`, "PRODUCT_INACTIVE");
    const quantity = Math.trunc(Number(raw.quantity) || 0);
    if (quantity < 1 || quantity > MAX_QTY) throw httpError(422, "Quantity must be between 1 and 999", "QTY_INVALID");
    const stock = Number(product.stock_quantity);
    if (Number.isFinite(stock) && stock < quantity) {
      throw httpError(422, `Not enough stock for ${product.name || "item"} (have ${stock}, need ${quantity})`, "INSUFFICIENT_STOCK");
    }
    rows.push({
      org_id: orgId,
      tab_id: bundle.tab.id,
      product_id: product.id,
      name: String(product.name || "Item").slice(0, 200),
      quantity,
      // Catalog price only — the browser never sets prices.
      unit_price: catalogUnitPrice(product),
      note: cleanText(raw.note, 200),
      station: stations.get(product.id) || DEFAULT_STATION,
      status: "pending",
      created_by: gate.user.id,
    });
  }
  ensure(await supabaseAdmin.from("pos_tab_items").insert(rows));
}

async function sendToKitchen(gate, bundle) {
  assertOpen(bundle);
  const pending = bundle.items.filter((item) => item.status === "pending");
  if (!pending.length) throw httpError(422, "There are no new items to send", "NOTHING_TO_SEND");
  const round = bundle.items.reduce((max, item) => Math.max(max, Number(item.round) || 0), 0) + 1;
  const groups = groupItemsByStation(pending);
  const label = tabLabel(bundle.tab, bundle.table);
  const created = [];
  for (const group of groups) {
    const ticket = ensure(
      await supabaseAdmin
        .from("pos_kitchen_tickets")
        .insert({
          org_id: gate.membership.orgId,
          tab_id: bundle.tab.id,
          ticket_number: kitchenTicketNumber(bundle.tab.order_number, round, group.station, groups.length),
          round,
          station: group.station,
          status: KITCHEN_STATUS.NEW,
          table_label: label,
          order_type: bundle.tab.order_type,
          server_name: bundle.tab.server_name,
          note: bundle.tab.note,
          created_by: gate.user.id,
        })
        .select("*")
        .single()
    );
    ensure(
      await supabaseAdmin
        .from("pos_tab_items")
        .update({ status: "sent", kot_id: ticket.id, round, updated_at: new Date().toISOString() })
        .in("id", group.items.map((i) => i.id))
        .eq("status", "pending")
    );
    created.push(publicTicket(ticket, group.items.map((i) => ({ name: i.name, quantity: Number(i.quantity), note: i.note }))));
  }
  return created;
}

export async function handleTabGet(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_ACCESS)) return;
  try {
    const bundle = await loadTabBundle(gate.membership.orgId, String(req.query?.id || "").trim());
    return res.status(200).json({ ok: true, ...publicBundle(bundle) });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function handleTabAction(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_SELL)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;
  const action = String(body.action || "");
  const now = new Date().toISOString();
  const can = (permission) => membershipHasPermission(gate.membership, permission);
  try {
    if (action === "open") {
      await assertRestaurantBusiness(orgId);
      const tab = await openTab(gate, body);
      let bundle = await loadTabBundle(orgId, tab.id);
      if (Array.isArray(body.items) && body.items.length) {
        await addItems(gate, bundle, body);
        bundle = await loadTabBundle(orgId, tab.id);
      }
      return res.status(201).json({ ok: true, ...publicBundle(bundle) });
    }

    if (action === "mark_clean") {
      await assertOrgRow("pos_tables", orgId, body.table_id, "Table");
      ensure(await supabaseAdmin.from("pos_tables").update({ cleaning_since: null, updated_at: now }).eq("org_id", orgId).eq("id", body.table_id));
      return res.status(200).json({ ok: true });
    }

    const bundle = await loadTabBundle(orgId, String(body.tab_id || "").trim());
    let extra = {};

    switch (action) {
      case "add_items":
        await addItems(gate, bundle, body);
        break;
      case "update_item": {
        assertOpen(bundle);
        const item = bundle.items.find((i) => i.id === body.item_id);
        if (!item) throw httpError(404, "Item not found", "ITEM_NOT_FOUND");
        if (item.status !== "pending") throw httpError(409, "Sent items cannot be changed — void them instead", "ITEM_SENT");
        const patch = { updated_at: now };
        if (body.quantity !== undefined) {
          const quantity = Math.trunc(Number(body.quantity) || 0);
          if (quantity < 1 || quantity > MAX_QTY) throw httpError(422, "Quantity must be between 1 and 999", "QTY_INVALID");
          patch.quantity = quantity;
        }
        if (body.note !== undefined) patch.note = cleanText(body.note, 200);
        ensure(await supabaseAdmin.from("pos_tab_items").update(patch).eq("id", item.id).eq("status", "pending"));
        break;
      }
      case "void_item": {
        assertOpen(bundle);
        const item = bundle.items.find((i) => i.id === body.item_id);
        if (!item || item.status === "void") throw httpError(404, "Item not found", "ITEM_NOT_FOUND");
        if (hasMoneyPortions(bundle)) throw httpError(409, "Items cannot change once part of the bill is being paid", "BILL_IN_PAYMENT");
        if (item.status === "pending") {
          ensure(await supabaseAdmin.from("pos_tab_items").delete().eq("id", item.id).eq("status", "pending"));
        } else {
          // Voiding something the kitchen already has is a manager action.
          if (!can(PERMISSIONS.POS_REFUND)) throw httpError(403, "Voiding sent items needs manager access", "POS_FORBIDDEN");
          ensure(
            await supabaseAdmin
              .from("pos_tab_items")
              .update({ status: "void", void_reason: cleanText(body.reason, 200) || "Voided", updated_at: now })
              .eq("id", item.id)
          );
          if (item.kot_id) {
            const siblings = bundle.items.filter((i) => i.kot_id === item.kot_id && i.id !== item.id && i.status !== "void");
            if (!siblings.length) {
              ensure(await supabaseAdmin.from("pos_kitchen_tickets").update({ status: KITCHEN_STATUS.VOID, updated_at: now }).eq("id", item.kot_id));
            }
          }
          await recordPosAuditEvent(
            posAuditCancellation({ orgId, intentId: null, actorId: gate.user.id, reason: `TAB_ITEM_VOID:${item.name}`, intentStatus: "void", paymentMethod: null })
          ).catch(() => null);
        }
        break;
      }
      case "send":
        extra = { sent_tickets: await sendToKitchen(gate, bundle) };
        break;
      case "details": {
        assertOpen(bundle);
        const patch = { updated_at: now };
        if (body.guests !== undefined) patch.guests = intOrNull(body.guests, { min: 1, max: 999 });
        if (body.note !== undefined) patch.note = cleanText(body.note, 500);
        if (body.customer_name !== undefined) patch.customer_name = cleanText(body.customer_name, 120);
        ensure(await supabaseAdmin.from("pos_tabs").update(patch).eq("id", bundle.tab.id));
        break;
      }
      case "discount":
      case "service_charge": {
        assertOpen(bundle);
        if (action === "discount" && !can(PERMISSIONS.POS_DISCOUNT)) throw httpError(403, "Discounts need discount access", "POS_FORBIDDEN");
        if (hasMoneyPortions(bundle)) throw httpError(409, "The bill cannot change once part of it is being paid", "BILL_IN_PAYMENT");
        const patch = { updated_at: now };
        if (action === "discount") {
          const amount = roundMoney(body.amount);
          const subtotal = tabTotals({ items: bundle.items }).subtotal;
          if (!(amount >= 0) || amount > subtotal) throw httpError(422, "Discount must be between 0 and the subtotal", "DISCOUNT_INVALID");
          patch.discount_amount = amount;
        } else {
          const rate = Number(body.rate);
          if (!Number.isFinite(rate) || rate < 0 || rate > 25) throw httpError(422, "Service charge must be between 0% and 25%", "SERVICE_CHARGE_INVALID");
          patch.service_charge_rate = Math.round(rate * 1000) / 1000;
        }
        ensure(await supabaseAdmin.from("pos_tabs").update(patch).eq("id", bundle.tab.id));
        break;
      }
      case "request_bill":
        assertOpen(bundle);
        ensure(
          await supabaseAdmin
            .from("pos_tabs")
            .update({ bill_requested_at: body.value === false ? null : now, updated_at: now })
            .eq("id", bundle.tab.id)
        );
        break;
      case "transfer": {
        assertOpen(bundle);
        if (bundle.tab.order_type !== ORDER_TYPE.DINE_IN) throw httpError(422, "Only dine-in orders sit at a table", "NOT_DINE_IN");
        const target = await assertOrgRow("pos_tables", orgId, body.to_table_id, "Table");
        if (target.id === bundle.tab.table_id) break;
        const { error } = await supabaseAdmin
          .from("pos_tabs")
          .update({ table_id: target.id, updated_at: now })
          .eq("id", bundle.tab.id)
          .eq("status", "open");
        if (error) throw uniqueViolation(error, `${tabLabel(null, target)} already has an open order — merge instead`, "TABLE_OCCUPIED");
        ensure(
          await supabaseAdmin
            .from("pos_kitchen_tickets")
            .update({ table_label: tabLabel(bundle.tab, target), updated_at: now })
            .eq("tab_id", bundle.tab.id)
            .in("status", LIVE_KITCHEN)
        );
        if (target.cleaning_since) ensure(await supabaseAdmin.from("pos_tables").update({ cleaning_since: null }).eq("id", target.id));
        break;
      }
      case "merge": {
        assertOpen(bundle);
        const source = await loadTabBundle(orgId, String(body.from_tab_id || "").trim());
        assertOpen(source);
        if (source.tab.id === bundle.tab.id) throw httpError(422, "Choose a different table to merge", "MERGE_SAME");
        if (hasMoneyPortions(source) || hasMoneyPortions(bundle)) {
          throw httpError(409, "Tables cannot be merged once a bill is being paid", "BILL_IN_PAYMENT");
        }
        ensure(await supabaseAdmin.from("pos_tab_items").update({ tab_id: bundle.tab.id, updated_at: now }).eq("tab_id", source.tab.id));
        ensure(
          await supabaseAdmin
            .from("pos_kitchen_tickets")
            .update({ tab_id: bundle.tab.id, table_label: tabLabel(bundle.tab, bundle.table), updated_at: now })
            .eq("tab_id", source.tab.id)
        );
        ensure(
          await supabaseAdmin
            .from("pos_tabs")
            .update({
              guests: (Number(bundle.tab.guests) || 0) + (Number(source.tab.guests) || 0) || null,
              updated_at: now,
            })
            .eq("id", bundle.tab.id)
        );
        ensure(
          await supabaseAdmin
            .from("pos_tabs")
            .update({ status: "void", merged_into: bundle.tab.id, closed_at: now, closed_by: gate.user.id, updated_at: now })
            .eq("id", source.tab.id)
        );
        break;
      }
      case "serve": {
        // Front of house: everything the kitchen marked ready has been served (dine-in) or collected
        // (takeaway / counter). Moves READY tickets to completed — the same KOT state machine the
        // kitchen display uses — and never touches payment.
        assertOpen(bundle);
        const ready = bundle.tickets.filter((t) => t.status === KITCHEN_STATUS.READY);
        if (!ready.length) throw httpError(409, "Nothing is ready to hand over yet", "NOTHING_READY");
        ensure(
          await supabaseAdmin
            .from("pos_kitchen_tickets")
            .update({ status: KITCHEN_STATUS.COMPLETED, completed_at: now, updated_at: now })
            .eq("org_id", orgId)
            .eq("tab_id", bundle.tab.id)
            .eq("status", KITCHEN_STATUS.READY)
        );
        // A paid takeaway / counter order that has been collected is finished: complete it.
        const after = await loadTabBundle(orgId, bundle.tab.id);
        const stillCooking = after.tickets.some((t) => LIVE_KITCHEN.includes(t.status));
        const pendingItems = after.items.some((i) => i.status === "pending");
        const inFlight = after.portions.some((p) => ACTIVE_INTENT.has(p.status));
        if (after.tab.order_type !== ORDER_TYPE.DINE_IN && after.summary.balance.settled && !stillCooking && !pendingItems && !inFlight) {
          ensure(
            await supabaseAdmin
              .from("pos_tabs")
              .update({ status: "closed", closed_at: now, closed_by: gate.user?.id || null, updated_at: now })
              .eq("id", bundle.tab.id)
              .eq("status", "open")
          );
          extra = { completed: true };
        }
        break;
      }
      case "close": {
        assertOpen(bundle);
        const live = bundle.items.filter((i) => i.status !== "void");
        if (live.length && !bundle.summary.balance.settled) {
          throw httpError(409, `This order still has ${bundle.summary.balance.due.toFixed(2)} to pay`, "BALANCE_DUE");
        }
        if (bundle.portions.some((p) => ACTIVE_INTENT.has(p.status))) {
          throw httpError(409, "A payment is still being confirmed", "PAYMENT_PENDING");
        }
        ensure(
          await supabaseAdmin
            .from("pos_tabs")
            .update({ status: live.length ? "closed" : "void", closed_at: now, closed_by: gate.user?.id || null, updated_at: now })
            .eq("id", bundle.tab.id)
            .eq("status", "open")
        );
        // Closing frees the table (Available). Venues that reset tables first ask for cleaning.
        if (bundle.table) {
          const cleaning = body.cleaning === true && live.length > 0;
          ensure(
            await supabaseAdmin
              .from("pos_tables")
              .update({ cleaning_since: cleaning ? now : null, updated_at: now })
              .eq("org_id", orgId)
              .eq("id", bundle.table.id)
          );
        }
        break;
      }
      case "void": {
        assertOpen(bundle);
        if (bundle.portions.some((p) => p.status === "paid" || ACTIVE_INTENT.has(p.status))) {
          throw httpError(409, "Paid orders cannot be voided — refund the sale instead", "TAB_HAS_PAYMENTS");
        }
        if (bundle.items.some((i) => i.status === "sent") && !can(PERMISSIONS.POS_REFUND)) {
          throw httpError(403, "Voiding an order the kitchen has needs manager access", "POS_FORBIDDEN");
        }
        ensure(
          await supabaseAdmin
            .from("pos_tabs")
            .update({ status: "void", closed_at: now, closed_by: gate.user.id, note: cleanText(body.reason, 500) || bundle.tab.note, updated_at: now })
            .eq("id", bundle.tab.id)
        );
        ensure(await supabaseAdmin.from("pos_kitchen_tickets").update({ status: KITCHEN_STATUS.VOID, updated_at: now }).eq("tab_id", bundle.tab.id).in("status", LIVE_KITCHEN));
        break;
      }
      default:
        return jsonError(res, 422, "Unknown order action", { code: "UNKNOWN_ACTION" });
    }

    const next = await loadTabBundle(orgId, bundle.tab.id);
    return res.status(200).json({ ok: true, ...publicBundle(next), ...extra });
  } catch (err) {
    if (err?.code === "TABLE_OCCUPIED" && err.tabId) {
      return jsonError(res, 409, err.message, { code: err.code, tab_id: err.tabId });
    }
    return sendError(res, err);
  }
}

// ── Bill / payment ─────────────────────────────────────────────────────────────────

/** Items already carried by a paid or in-flight portion (their stock moves with that sale). */
function carriedItemIds(bundle) {
  const ids = new Set();
  for (const portion of bundle.portions) {
    if (portion.status === "paid" || ACTIVE_INTENT.has(portion.status)) {
      for (const id of portion.allocation?.carried_item_ids || []) ids.add(id);
    }
  }
  return ids;
}

/**
 * Work out one bill portion. Exported for tests.
 * @returns {{ amount: number, label: string, splitKind: string, allocation: object, carried: object[] }}
 */
export function planBillPortion(bundle, split = {}) {
  const items = bundle.items.filter((i) => i.status !== "void");
  const { totals, balance } = bundle.summary;
  if (!items.length || totals.total <= 0) throw httpError(422, "There is nothing to pay on this order", "NOTHING_TO_PAY");
  if (items.some((i) => i.status === "pending")) {
    throw httpError(422, "Send or remove the new items before taking payment", "PENDING_ITEMS");
  }
  if (balance.available <= 0) {
    throw httpError(409, balance.pending > 0 ? "A payment for the rest of this bill is being confirmed" : "This bill is fully paid", "NOTHING_DUE");
  }
  const carried = carriedItemIds(bundle);
  const uncarried = items.filter((i) => !carried.has(i.id));
  const kind = ["equal", "items", "amount"].includes(split.kind) ? split.kind : "full";
  let amount;
  let label;
  let lines = null;
  const allocation = {};

  if (kind === "full") {
    amount = balance.available;
    label = balance.paid > 0 || balance.pending > 0 ? "Remaining balance" : "Full bill";
  } else if (kind === "equal") {
    const parts = Math.trunc(Number(split.parts) || 0);
    const index = Math.trunc(Number(split.part_index));
    if (parts < 2 || parts > 50) throw httpError(422, "Split between 2 and 50 guests", "SPLIT_PARTS_INVALID");
    if (!(index >= 0 && index < parts)) throw httpError(422, "Choose which guest is paying", "SPLIT_PART_INVALID");
    const taken = bundle.portions.some(
      (p) => p.split_kind === "equal" && p.allocation?.parts === parts && p.allocation?.part_index === index && (p.status === "paid" || ACTIVE_INTENT.has(p.status))
    );
    if (taken) throw httpError(409, `Guest ${index + 1} has already paid`, "SPLIT_PART_PAID");
    amount = Math.min(splitEqually(totals.total, parts)[index], balance.available);
    label = `Guest ${index + 1} of ${parts}`;
    Object.assign(allocation, { parts, part_index: index });
  } else if (kind === "items") {
    const selection = (Array.isArray(split.item_ids) ? split.item_ids : []).map((id) => ({ id: String(id) }));
    if (!selection.length) throw httpError(422, "Choose the items this guest is paying for", "SPLIT_ITEMS_REQUIRED");
    const clash = selection.find((s) => carried.has(s.id));
    if (clash) throw httpError(409, "Some of those items are already paid", "SPLIT_ITEMS_PAID");
    const share = itemsShare({ items, selection, discountAmount: bundle.tab.discount_amount, serviceChargeRate: bundle.tab.service_charge_rate });
    if (!share.lines.length) throw httpError(422, "Those items are not on this bill", "SPLIT_ITEMS_INVALID");
    amount = Math.min(share.amount, balance.available);
    lines = share.lines;
    label = cleanText(split.label, 60) || `Items (${share.lines.length})`;
  } else {
    amount = roundMoney(split.amount);
    if (!(amount > 0)) throw httpError(422, "Enter an amount to pay", "SPLIT_AMOUNT_INVALID");
    if (amount > balance.available) throw httpError(422, `The most that can be paid now is ${balance.available.toFixed(2)}`, "SPLIT_AMOUNT_TOO_HIGH");
    label = cleanText(split.label, 60) || "Part payment";
  }

  // Stock moves with exactly one sale per item: item splits carry their items; any portion that
  // settles the whole remaining balance carries every item not yet carried.
  const settlesRemainder = roundMoney(amount) >= roundMoney(balance.available);
  const carriedLines = lines || (settlesRemainder ? uncarried : []);
  allocation.carried_item_ids = carriedLines.map((l) => l.id);
  if (kind === "items") allocation.item_ids = carriedLines.map((l) => l.id);
  return { amount: roundMoney(amount), label, splitKind: kind, allocation, carried: carriedLines, settlesRemainder };
}

export async function handleTabPay(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_SELL)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;
  const paymentMethod = String(body.payment_method || "").trim().toLowerCase();
  if (!["cash", "digital", "other"].includes(paymentMethod)) {
    if (paymentMethod === "card") {
      return jsonError(res, 422, "Card-present checkout is not available yet. Use Cash or EFT / Digital.", { code: "POS_CARD_UNAVAILABLE" });
    }
    return jsonError(res, 422, "payment_method must be cash or digital", { code: "PAYMENT_METHOD_INVALID" });
  }
  try {
    const bundle = await loadTabBundle(orgId, String(body.tab_id || "").trim());
    assertOpen(bundle);
    const currency = String(body.currency || "ZAR").trim().toUpperCase().slice(0, 3) || "ZAR";
    // Demo Mode: EFT / Digital is a simulated payment (card_terminal rail, demo_simulated) — never a provider.
    const demoPayment = gate.membership?.isDemo === true && paymentMethod === "digital";
    const rail = demoPayment ? CUSTOMER_PAYMENT_PROVIDERS.CARD_TERMINAL : resolvePosTenderProvider(paymentMethod, { currency });
    const portion = planBillPortion(bundle, body.split || {});

    // Same shift rule as the counter: money goes to an open register session.
    let registerId = bundle.tab.register_id || null;
    if (!registerId && body.register_id) {
      const resolved = await resolveCheckoutRegister(orgId, gate.user.id, String(body.register_id), gate.membership).catch(() => null);
      registerId = resolved?.ok ? resolved.register?.id || null : null;
    }
    let sessionId = null;
    if (registerId) {
      const session = await resolveOpenSession(orgId, registerId);
      if (!session.ok) throw httpError(422, session.error, session.code);
      sessionId = session.session?.id || null;
    }
    const connection = await ensureNativePosConnection(orgId, gate.user.id);
    const idempotencyKey = cleanText(body.idempotency_key, 120) || crypto.randomUUID();
    const label = tabLabel(bundle.tab, bundle.table);
    const { totals } = bundle.summary;
    const saleLines = portion.carried.map((item, index) => ({
      product_id: item.product_id,
      line_id: `tab-${item.id}`,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unit_price) || 0,
      line_total: roundMoney((Number(item.unit_price) || 0) * (Number(item.quantity) || 0)),
      sku: "",
      barcode: "",
      position: index,
    }));
    const isWholeBill = portion.splitKind === "full" && bundle.portions.every((p) => p.status !== "paid");
    if (isWholeBill && totals.service_charge > 0) {
      saleLines.push({ product_id: null, line_id: "service-charge", name: "Service charge", quantity: 1, unit_price: totals.service_charge, line_total: totals.service_charge });
    }
    const checkout = {
      connection_id: connection.id,
      register_id: registerId,
      session_id: sessionId,
      items: saleLines,
      subtotal: isWholeBill ? roundMoney(totals.subtotal + totals.service_charge) : portion.amount,
      discount_amount: isWholeBill ? totals.discount_amount : 0,
      tax_amount: 0,
      tax_rate: 0,
      payment_method: paymentMethod === "other" ? "cash" : paymentMethod,
      currency,
      client_id: bundle.tab.client_id || null,
      company_id: bundle.tab.company_id || null,
      cashier_id: gate.user.id,
      cashier_name: cleanText(body.cashier_name, 120) || bundle.tab.server_name,
      brand_name: cleanText(body.brand_name, 120),
      customer_name: bundle.tab.customer_name,
      idempotency_key: idempotencyKey,
      origin: "pos_table",
      settlement: isTillCashSettlement(rail) ? "till" : demoPayment ? "terminal" : "online",
      tab_id: bundle.tab.id,
      tab_label: label,
      order_number: bundle.tab.order_number,
      bill_label: portion.label,
    };

    const intent = await createCustomerPaymentIntent({
      orgId,
      sourceKind: "pos",
      provider: rail,
      amount: portion.amount,
      currency,
      idempotencyKey,
      companyId: bundle.tab.company_id || null,
      clientId: bundle.tab.client_id || null,
      createdBy: gate.user.id,
      metadata: {
        origin: "pos_table",
        settlement: checkout.settlement,
        payment_method: checkout.payment_method,
        paidly_pay_method: paymentMethod === "digital" ? "eft" : "cash",
        tab_id: bundle.tab.id,
        checkout,
        ...(demoPayment ? { demo_simulated: true } : {}),
      },
    });
    const { error: linkError } = await supabaseAdmin.from("pos_tab_payments").insert({
      org_id: orgId,
      tab_id: bundle.tab.id,
      payment_intent_id: intent.id,
      label: portion.label,
      split_kind: portion.splitKind,
      allocation: portion.allocation,
      created_by: gate.user.id,
    });
    if (linkError && linkError.code !== "23505") throw linkError;

    if (isTillCashSettlement(rail)) {
      const settled = await settleTillCashIntent(intent, body.amount_tendered);
      if (settled.intent?.status !== "paid") {
        return jsonError(res, 422, settled.charge?.error || "Cash payment was not completed", {
          code: settled.charge?.code || "CASH_NOT_SETTLED",
          payment_intent: publicPaymentIntentView(settled.intent),
        });
      }
      const sale = await settlePosIntent(settled.intent, { actorType: POS_AUDIT_ACTOR.USER });
      const next = await loadTabBundle(orgId, bundle.tab.id);
      return res.status(200).json({
        ok: true,
        paid: true,
        change_due: settled.charge?.change_due ?? null,
        amount_tendered: settled.charge?.amount_tendered ?? null,
        sale_id: sale?.saleId || null,
        sale: sale?.sale ? salePublicView(sale.sale) : null,
        portion: { label: portion.label, amount: portion.amount },
        payment_intent: publicPaymentIntentView(settled.intent),
        ...publicBundle(next),
      });
    }

    const appOrigin = resolvePaidlyPayOrigin(process.env, req).replace(/\/$/, "");
    const back = `${appOrigin}/pos?payment=return&intent=${encodeURIComponent(intent.id)}&tab=${encodeURIComponent(bundle.tab.id)}`;
    const confirmed = await confirmCustomerPaymentIntent(intent, {
      appOrigin,
      successUrl: back,
      cancelUrl: `${back}&result=cancel`,
      errorUrl: `${back}&result=error`,
    });
    const nextAction = confirmed.charge?.next_action || null;
    if (isDemoNextAction(nextAction)) {
      return res.status(202).json({
        ok: true,
        pending: true,
        demo: true,
        portion: { label: portion.label, amount: portion.amount },
        payment_intent: publicPaymentIntentView(confirmed.intent),
        next_action: nextAction,
      });
    }
    if (!nextAction?.redirect_url) {
      return jsonError(res, 422, confirmed.charge?.error || "The online payment could not be started", {
        code: confirmed.charge?.code || "PROVIDER_REDIRECT_MISSING",
        payment_intent: publicPaymentIntentView(confirmed.intent),
      });
    }
    return res.status(202).json({
      ok: true,
      pending: true,
      portion: { label: portion.label, amount: portion.amount },
      payment_intent: publicPaymentIntentView(confirmed.intent),
      next_action: nextAction,
    });
  } catch (err) {
    return sendError(res, err);
  }
}

// ── Kitchen display (KDS) ───────────────────────────────────────────────────────────

export async function handleKitchenGet(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_ACCESS)) return;
  const orgId = gate.membership.orgId;
  const station = req.query?.station ? normalizeStation(req.query.station) : null;
  try {
    let query = supabaseAdmin.from("pos_kitchen_tickets").select("*").eq("org_id", orgId).in("status", LIVE_KITCHEN).order("sent_at", { ascending: true }).limit(200);
    if (station) query = query.eq("station", station);
    const tickets = ensure(await query) || [];
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    let doneQuery = supabaseAdmin
      .from("pos_kitchen_tickets")
      .select("*")
      .eq("org_id", orgId)
      .eq("status", KITCHEN_STATUS.COMPLETED)
      .gte("completed_at", since)
      .order("completed_at", { ascending: false })
      .limit(20);
    if (station) doneQuery = doneQuery.eq("station", station);
    const recent = ensure(await doneQuery) || [];
    const all = [...tickets, ...recent];
    const items = all.length
      ? ensure(await supabaseAdmin.from("pos_tab_items").select("id, kot_id, name, quantity, note, status").in("kot_id", all.map((t) => t.id))) || []
      : [];
    const byTicket = new Map();
    for (const item of items) {
      if (item.status === "void") continue;
      if (!byTicket.has(item.kot_id)) byTicket.set(item.kot_id, []);
      byTicket.get(item.kot_id).push({ id: item.id, name: item.name, quantity: Number(item.quantity), note: item.note });
    }
    const stations = [...new Set([DEFAULT_STATION, "bar", ...all.map((t) => t.station)])];
    return res.status(200).json({
      ok: true,
      stations,
      tickets: tickets.map((t) => publicTicket(t, byTicket.get(t.id) || [])),
      recent: recent.map((t) => publicTicket(t, byTicket.get(t.id) || [])),
    });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function handleKitchenAction(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_ACCESS)) return;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const orgId = gate.membership.orgId;
  const next = String(body.status || "");
  if (![KITCHEN_STATUS.PREPARING, KITCHEN_STATUS.READY, KITCHEN_STATUS.COMPLETED].includes(next)) {
    return jsonError(res, 422, "status must be preparing, ready or completed", { code: "KITCHEN_STATUS_INVALID" });
  }
  try {
    const ticket = await assertOrgRow("pos_kitchen_tickets", orgId, body.ticket_id, "Ticket");
    if (!canMoveKitchenTicket(ticket.status, next)) {
      throw httpError(409, `A ${ticket.status} ticket cannot move to ${next}`, "KITCHEN_TRANSITION_INVALID");
    }
    const now = new Date().toISOString();
    const patch = { status: next, updated_at: now };
    if (next === KITCHEN_STATUS.PREPARING && !ticket.accepted_at) patch.accepted_at = now;
    if (next === KITCHEN_STATUS.READY) patch.ready_at = now;
    if (next === KITCHEN_STATUS.COMPLETED) patch.completed_at = now;
    const updated = ensure(
      await supabaseAdmin.from("pos_kitchen_tickets").update(patch).eq("id", ticket.id).eq("status", ticket.status).select("*").maybeSingle()
    );
    return res.status(200).json({ ok: true, ticket: publicTicket(updated || { ...ticket, ...patch }) });
  } catch (err) {
    return sendError(res, err);
  }
}

// ── Orders screen ──────────────────────────────────────────────────────────────────

/** Compact lines for order cards: what was ordered and whether the kitchen has it. */
function orderLines(items = []) {
  return items
    .filter((i) => i.status !== "void")
    .map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity) || 0, note: i.note || null, status: i.status, round: i.round || null }));
}

/**
 * Orders screen: every open order (dine-in, takeaway, counter) with its stage and payment state,
 * the live kitchen queue with items, and today's completed orders — one payload, so switching
 * order type or status filter on the till never refetches.
 */
export async function handleRestaurantOrders(req, res, gate) {
  if (forbidUnlessPermission(res, gate.membership, PERMISSIONS.POS_ACCESS)) return;
  const orgId = gate.membership.orgId;
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [open, done, live] = await Promise.all([
      supabaseAdmin.from("pos_tabs").select("*").eq("org_id", orgId).eq("status", "open").order("opened_at", { ascending: true }),
      supabaseAdmin
        .from("pos_tabs")
        .select("*")
        .eq("org_id", orgId)
        .eq("status", "closed")
        .gte("closed_at", startOfDay.toISOString())
        .order("closed_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("pos_kitchen_tickets")
        .select("*")
        .eq("org_id", orgId)
        .in("status", LIVE_KITCHEN)
        .order("sent_at", { ascending: true })
        .limit(200),
    ]);
    const tabs = [...(ensure(open) || []), ...(ensure(done) || [])];
    const liveTickets = ensure(live) || [];
    const tableIds = tabs.map((t) => t.table_id).filter(Boolean);
    const [tableRows, children, ticketItems] = await Promise.all([
      tableIds.length
        ? supabaseAdmin.from("pos_tables").select("*").eq("org_id", orgId).in("id", [...new Set(tableIds)])
        : Promise.resolve({ data: [] }),
      loadTabChildren(orgId, tabs.map((t) => t.id)),
      liveTickets.length
        ? supabaseAdmin.from("pos_tab_items").select("id, kot_id, name, quantity, note, status").eq("org_id", orgId).in("kot_id", liveTickets.map((t) => t.id))
        : Promise.resolve({ data: [] }),
    ]);
    const tables = new Map((ensure(tableRows) || []).map((t) => [t.id, t]));
    const names = await loadMemberNames(orgId, tabs.map((t) => t.server_membership_id));
    const now = new Date();
    const rows = tabs.map((tab) => {
      const items = children.items.get(tab.id) || [];
      const summary = summarizeTab(tab, {
        table: tables.get(tab.table_id) || null,
        items,
        tickets: children.tickets.get(tab.id) || [],
        portions: children.portions.get(tab.id) || [],
        now,
      });
      return { ...summary, server_display: names.get(tab.server_membership_id) || summary.server_name || null, lines: orderLines(items) };
    });

    const itemsByTicket = new Map();
    for (const item of ensure(ticketItems) || []) {
      if (item.status === "void") continue;
      if (!itemsByTicket.has(item.kot_id)) itemsByTicket.set(item.kot_id, []);
      itemsByTicket.get(item.kot_id).push({ id: item.id, name: item.name, quantity: Number(item.quantity), note: item.note });
    }
    const orderNumberByTab = new Map(tabs.map((t) => [t.id, t.order_number]));
    const tickets = liveTickets.map((t) => ({
      ...publicTicket(t, itemsByTicket.get(t.id) || []),
      order_number: orderNumberByTab.get(t.tab_id) || null,
    }));

    const openRows = rows.filter((r) => r.status === "open");
    return res.status(200).json({
      ok: true,
      orders: rows,
      tickets,
      // Legacy grouping (kept for older tills).
      live: openRows.filter((r) => r.order_type === ORDER_TYPE.DINE_IN),
      takeaway: openRows.filter((r) => r.order_type === ORDER_TYPE.TAKEAWAY),
      counter: openRows.filter((r) => r.order_type === ORDER_TYPE.COUNTER),
      completed: rows.filter((r) => r.status === "closed"),
      generated_at: now.toISOString(),
    });
  } catch (err) {
    return sendError(res, err);
  }
}
