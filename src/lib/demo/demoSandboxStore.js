/**
 * In-browser Paidly demo. The visitor never receives a Supabase JWT and no company is created.
 * Production queries keep using the real client — this module only answers when the sandbox flag is set
 * and no real Paidly session is stored.
 */
import { patchAuthSession } from "@/stores/authSessionStore";
import { setDemoModeActive, DEMO_BUSINESS_NAME } from "@/lib/demo/demoModeState";
import { buildInvoiceFromQuote } from "@shared/commercial/quoteInvoiceConversion.js";
import {
  DEMO_MEMBERSHIP_ID,
  DEMO_ORG_ID,
  DEMO_RESET_INVOICE_ID,
  DEMO_SANDBOX_TOKEN,
  DEMO_USER_ID,
  createDemoDataset,
} from "@/lib/demo/demoSandboxSeed.js";

export {
  DEMO_MEMBERSHIP_ID,
  DEMO_ORG_ID,
  DEMO_RESET_INVOICE_ID,
  DEMO_SANDBOX_TOKEN,
  DEMO_USER_ID,
};

const FLAG = "paidly-demo-sandbox";
const DATA = "paidly-demo-sandbox-data";
const AUTH_STORAGE_KEY = "paidly-auth";

const mem = { flag: false, json: null };

function sessionBag() {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* private mode */
  }
  return null;
}

function readFlag() {
  const bag = sessionBag();
  if (bag) return bag.getItem(FLAG) === "1";
  return mem.flag === true;
}

function writeFlag(on) {
  mem.flag = on;
  const bag = sessionBag();
  if (!bag) return;
  if (on) bag.setItem(FLAG, "1");
  else bag.removeItem(FLAG);
}

function readJson() {
  const bag = sessionBag();
  const raw = bag ? bag.getItem(DATA) : mem.json;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(state) {
  const raw = JSON.stringify(state);
  mem.json = raw;
  const bag = sessionBag();
  if (bag) bag.setItem(DATA, raw);
}

/** A real Supabase session in this browser wins. The sandbox must not hide it. */
export function realSupabaseTokenStored() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    return raw.includes("access_token") && raw.includes("eyJ");
  } catch {
    return false;
  }
}

export function isDemoSandbox() {
  return readFlag() && !realSupabaseTokenStored();
}

let state = null;

function ensureState() {
  if (state) return state;
  state = readJson() || createDemoDataset();
  writeJson(state);
  return state;
}

function persist() {
  if (state) writeJson(state);
}

/** POS and other in-memory edits share this dataset. Call after a mutation that did not go through demoFrom(). */
export function touchDemoDataset() {
  persist();
}

export function demoDataset() {
  return ensureState();
}

export function demoTable(name) {
  const bag = ensureState().tables;
  if (!bag[name]) bag[name] = [];
  return bag[name];
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function same(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a == null && b == null;
  return String(a) === String(b);
}

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== "" && String(b).trim() !== "") {
    return na - nb;
  }
  return String(a).localeCompare(String(b));
}

function matchOp(row, filter) {
  const value = row?.[filter.col];
  const expected = filter.val;
  switch (filter.op) {
    case "eq":
      return same(value, expected);
    case "neq":
      return !same(value, expected);
    case "in":
      return Array.isArray(expected) && expected.some((item) => same(value, item));
    case "is":
      return expected == null ? value == null : same(value, expected);
    case "gt":
      return compare(value, expected) > 0;
    case "gte":
      return compare(value, expected) >= 0;
    case "lt":
      return compare(value, expected) < 0;
    case "lte":
      return compare(value, expected) <= 0;
    case "ilike":
    case "like": {
      const needle = String(expected ?? "").replace(/%/g, "").toLowerCase();
      return String(value ?? "").toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}

function rowMatches(row, filters, orGroup) {
  if (!filters.every((filter) => matchOp(row, filter))) return false;
  if (orGroup.length && !orGroup.some((filter) => matchOp(row, filter))) return false;
  return true;
}

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const tail = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(12, "0");
  return `b0000001-0000-4000-8000-${tail}`;
}

class DemoQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orGroup = [];
    this.orders = [];
    this.limitN = null;
    this.rangeFrom = null;
    this.rangeTo = null;
    this.op = "select";
    this.payload = null;
    this.mode = null;
    this.head = false;
  }

  select(_cols, opts) {
    if (opts?.head) this.head = true;
    return this;
  }

  eq(col, val) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }

  neq(col, val) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }

  in(col, val) {
    this.filters.push({ op: "in", col, val });
    return this;
  }

  is(col, val) {
    this.filters.push({ op: "is", col, val });
    return this;
  }

  gt(col, val) {
    this.filters.push({ op: "gt", col, val });
    return this;
  }

  gte(col, val) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }

  lt(col, val) {
    this.filters.push({ op: "lt", col, val });
    return this;
  }

  lte(col, val) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }

  like(col, val) {
    this.filters.push({ op: "like", col, val });
    return this;
  }

  ilike(col, val) {
    this.filters.push({ op: "ilike", col, val });
    return this;
  }

  or(expr) {
    const parts = String(expr || "").split(",");
    for (const part of parts) {
      const match = part.match(/^([A-Za-z0-9_]+)\.(eq|neq|is|ilike|like|gt|gte|lt|lte)\.(.*)$/);
      if (!match) continue;
      this.orGroup.push({
        op: match[2],
        col: match[1],
        val: match[3] === "null" ? null : match[3],
      });
    }
    return this;
  }

  filter(col, op, val) {
    this.filters.push({ op, col, val });
    return this;
  }

  order(col, opts) {
    this.orders.push({ col, ascending: opts?.ascending !== false });
    return this;
  }

  limit(n) {
    this.limitN = Number(n);
    return this;
  }

  range(from, to) {
    this.rangeFrom = Number(from);
    this.rangeTo = Number(to);
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  insert(payload) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  execute() {
    try {
      return { data: this.run(), error: null, count: this.count() };
    } catch (error) {
      return { data: null, error: { message: error.message, code: error.code || "DEMO_SANDBOX" }, count: null };
    }
  }

  count() {
    return this.matched().length;
  }

  matched() {
    return demoTable(this.table).filter((row) => rowMatches(row, this.filters, this.orGroup));
  }

  run() {
    if (this.op === "insert" || this.op === "upsert") return this.writeInsert();
    if (this.op === "update") return this.writeUpdate();
    if (this.op === "delete") return this.writeDelete();
    return this.read();
  }

  read() {
    let rows = this.matched().map((row) => clone(row));
    for (const order of this.orders) {
      rows.sort((a, b) => {
        const diff = compare(a?.[order.col], b?.[order.col]);
        return order.ascending ? diff : -diff;
      });
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitN != null) {
      rows = rows.slice(0, this.limitN);
    }
    if (this.head) return null;
    if (this.mode === "maybe") {
      if (rows.length > 1) {
        const error = new Error("multiple rows");
        error.code = "PGRST116";
        throw error;
      }
      return rows[0] || null;
    }
    if (this.mode === "single") {
      if (rows.length !== 1) {
        const error = new Error(rows.length ? "multiple rows" : "no rows");
        error.code = "PGRST116";
        throw error;
      }
      return rows[0];
    }
    return rows;
  }

  writeInsert() {
    const list = Array.isArray(this.payload) ? this.payload : [this.payload];
    const table = demoTable(this.table);
    const now = new Date().toISOString();
    const created = list.filter(Boolean).map((row) => {
      const next = {
        ...clone(row),
        id: row.id || newId(),
        created_at: row.created_at || now,
        updated_at: now,
      };
      if (next.org_id == null && this.table !== "profiles" && this.table !== "organizations") {
        next.org_id = DEMO_ORG_ID;
      }
      const existing = table.findIndex((item) => item.id === next.id);
      if (existing >= 0) table[existing] = next;
      else table.push(next);
      return clone(next);
    });
    persist();
    if (this.mode === "single" || this.mode === "maybe") return created[0] || null;
    return created;
  }

  writeUpdate() {
    const patch = this.payload && typeof this.payload === "object" ? this.payload : {};
    const now = new Date().toISOString();
    const updated = [];
    for (const row of demoTable(this.table)) {
      if (!rowMatches(row, this.filters, this.orGroup)) continue;
      Object.assign(row, clone(patch), { updated_at: now });
      updated.push(clone(row));
    }
    persist();
    if (this.mode === "single" || this.mode === "maybe") return updated[0] || null;
    return updated;
  }

  writeDelete() {
    const table = demoTable(this.table);
    const kept = [];
    const removed = [];
    for (const row of table) {
      if (rowMatches(row, this.filters, this.orGroup)) removed.push(clone(row));
      else kept.push(row);
    }
    ensureState().tables[this.table] = kept;
    persist();
    return removed;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
}

export function demoFrom(table) {
  const query = new DemoQuery(String(table || ""));
  const proxy = new Proxy(query, {
    get(target, prop) {
      if (prop in target) {
        const value = target[prop];
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (typeof prop !== "string") return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

function nextDocumentNumber(args) {
  const docType = String(args?.p_doc_type || "invoice");
  const table = docType === "quote" ? "quotes" : "invoices";
  const field = docType === "quote" ? "quote_number" : "invoice_number";
  const prefix = args?.p_prefix || (docType === "quote" ? "QUO" : "INV");
  let max = 0;
  for (const row of demoTable(table)) {
    const match = String(row[field] || "").match(/(\d+)\s*$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(max + 1).padStart(4, "0")}`;
}

function convertQuote(args) {
  const quoteId = args?.p_quote_id;
  const quote = demoTable("quotes").find((row) => row.id === quoteId);
  if (!quote) {
    const error = new Error("Quote not found");
    error.code = "DEMO_QUOTE_MISSING";
    throw error;
  }
  const existing = demoTable("invoices").find((row) => row.source_quote_id === quoteId);
  if (existing) {
    return {
      already_converted: true,
      invoice_id: existing.id,
      invoice_number: existing.invoice_number,
      invoice: clone(existing),
    };
  }
  const invoiceNumber = nextDocumentNumber({ p_doc_type: "invoice", p_prefix: "INV" });
  const built = buildInvoiceFromQuote(quote, {
    invoiceId: newId(),
    invoiceNumber,
    createdBy: DEMO_USER_ID,
    overrides: args?.p_overrides || {},
  });
  if (built.already_converted) {
    return {
      already_converted: true,
      invoice_id: built.invoice?.id || null,
      invoice_number: built.invoice?.invoice_number || null,
      invoice: built.invoice || null,
    };
  }
  const now = new Date().toISOString();
  const invoice = {
    ...built.invoice,
    org_id: DEMO_ORG_ID,
    user_id: DEMO_USER_ID,
    created_by: DEMO_USER_ID,
    created_at: now,
    updated_at: now,
    currency: quote.currency || "ZAR",
  };
  demoTable("invoices").push(invoice);
  quote.status = "converted";
  quote.converted_at = now;
  const items = Array.isArray(built.items) ? built.items : [];
  items.forEach((item, index) => {
    demoTable("invoice_items").push({
      id: newId(),
      org_id: DEMO_ORG_ID,
      invoice_id: invoice.id,
      description: item.description || item.name || "Item",
      quantity: item.quantity || 1,
      unit_price: item.unit_price || item.rate || 0,
      line_total: item.line_total || item.amount || 0,
      sort_order: index,
    });
  });
  persist();
  return {
    already_converted: false,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    invoice: clone(invoice),
  };
}

export function demoRpc(name, args) {
  try {
    if (name === "next_document_number") return { data: nextDocumentNumber(args), error: null };
    if (name === "convert_quote_to_invoice") return { data: convertQuote(args), error: null };
    return {
      data: null,
      error: { message: "Not available in the demo", code: "DEMO_SANDBOX" },
    };
  } catch (error) {
    return { data: null, error: { message: error.message, code: error.code || "DEMO_SANDBOX" } };
  }
}

export function demoAuthSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 4 * 60 * 60;
  return {
    access_token: DEMO_SANDBOX_TOKEN,
    refresh_token: DEMO_SANDBOX_TOKEN,
    expires_at: expiresAt,
    expires_in: 4 * 60 * 60,
    token_type: "bearer",
    user: {
      id: DEMO_USER_ID,
      email: "demo@paidly.demo",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      aud: "authenticated",
      app_metadata: { paidly_demo: true },
      user_metadata: { full_name: "Demo Host" },
    },
  };
}

function appUser() {
  const profile = demoTable("profiles")[0] || {};
  return {
    id: DEMO_USER_ID,
    supabase_id: DEMO_USER_ID,
    auth_id: DEMO_USER_ID,
    email: "demo@paidly.demo",
    role: "user",
    full_name: profile.full_name || "Demo Host",
    display_name: profile.full_name || "Demo Host",
    company_name: profile.company_name || DEMO_BUSINESS_NAME,
    company_address: profile.company_address || "",
    currency: "ZAR",
    timezone: "Africa/Johannesburg",
    plan: "growth",
    subscription_plan: "growth",
    subscription_status: "trialing",
    profileReady: true,
    app_metadata: { paidly_demo: true },
  };
}

function normalizedSession() {
  const raw = demoAuthSession();
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: raw.expires_at,
    user: raw.user,
  };
}

export function installSandboxSession() {
  if (realSupabaseTokenStored()) {
    clearDemoSandbox();
    return null;
  }
  writeFlag(true);
  ensureState();
  const session = normalizedSession();
  patchAuthSession({
    session,
    user: appUser(),
    profileReady: true,
    loading: false,
    authLoadingTimedOut: false,
  });
  setDemoModeActive(true);
  return {
    businessName: DEMO_BUSINESS_NAME,
    expiresAt: ensureState().expires_at || null,
  };
}

export function resetDemoSandbox() {
  state = createDemoDataset();
  writeFlag(true);
  persist();
  setDemoModeActive(true);
  return { expiresAt: state.expires_at };
}

export function clearDemoSandbox() {
  state = null;
  writeFlag(false);
  mem.json = null;
  const bag = sessionBag();
  if (bag) bag.removeItem(DATA);
  setDemoModeActive(false);
}

export function buildDemoBootstrap() {
  const data = ensureState();
  const profile = data.tables.profiles[0] || {};
  const org = data.tables.organizations[0] || null;
  return {
    user: {
      id: DEMO_USER_ID,
      full_name: profile.full_name,
      email: profile.email,
      company_name: profile.company_name,
      currency: "ZAR",
    },
    organization: org,
    recentInvoices: clone(data.tables.invoices),
    dashboard: {
      clients: clone(data.tables.clients),
      quotes: clone(data.tables.quotes),
      payslips: clone(data.tables.payslips),
      expenses: clone(data.tables.expenses),
      payments: clone(data.tables.payments),
    },
    stats: {},
  };
}

export function buildDemoSubscription() {
  const expires = ensureState().expires_at;
  return {
    accessGranted: true,
    currentPlan: "growth",
    currentStatus: "trialing",
    entitlement: {
      accessGranted: true,
      plan: "growth",
      status: "trialing",
      trialing: true,
      trialEndsAt: expires,
      trialDaysRemaining: 14,
      inGrace: false,
      limits: null,
    },
  };
}
