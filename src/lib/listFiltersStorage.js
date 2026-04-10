/**
 * Single-document persistence for list filter UIs (invoices / clients / expenses).
 * Per-user buckets with legacy key migration and guest fallback for signed-in users
 * who had filters saved before per-user storage existed.
 */

const ROOT_KEY = "paidly_list_filters_v1";
const SCHEMA_VERSION = 1;

const LEGACY_KEYS = {
  invoices: "invoice_filters",
  clients: "client_filters",
  expenses: "expense_filters",
};

function readRoot() {
  if (typeof localStorage === "undefined") {
    return { v: SCHEMA_VERSION, users: {} };
  }
  try {
    const raw = localStorage.getItem(ROOT_KEY);
    if (!raw) return { v: SCHEMA_VERSION, users: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== SCHEMA_VERSION || typeof parsed.users !== "object") {
      return { v: SCHEMA_VERSION, users: {} };
    }
    return parsed;
  } catch {
    return { v: SCHEMA_VERSION, users: {} };
  }
}

function writeRoot(data) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ROOT_KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Pull old flat keys into root.users._guest and remove them.
 * @returns {boolean} whether root was mutated
 */
function migrateLegacyIntoRoot(root) {
  let changed = false;
  root.users = root.users && typeof root.users === "object" ? root.users : {};
  for (const [kind, legacyKey] of Object.entries(LEGACY_KEYS)) {
    if (typeof localStorage === "undefined") break;
    const raw = localStorage.getItem(legacyKey);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!root.users._guest) root.users._guest = {};
      if (root.users._guest[kind] == null) {
        root.users._guest[kind] = parsed;
        changed = true;
      }
    } catch {
      /* drop bad legacy */
    }
    try {
      localStorage.removeItem(legacyKey);
    } catch {
      /* ignore */
    }
    changed = true;
  }
  return changed;
}

function pickSection(root, userKey, kind) {
  const direct = root.users[userKey]?.[kind];
  if (direct && typeof direct === "object") return direct;
  if (userKey !== "_guest") {
    const guest = root.users._guest?.[kind];
    if (guest && typeof guest === "object") return guest;
  }
  return null;
}

/**
 * @param {string|null|undefined} userId - Supabase/auth user id, or null when signed out
 * @param {'invoices'|'clients'|'expenses'} kind
 * @param {Record<string, unknown>} defaults
 */
export function readListFilters(userId, kind, defaults) {
  const userKey = userId || "_guest";
  let root = readRoot();
  if (migrateLegacyIntoRoot(root)) {
    writeRoot(root);
  }
  const slice = pickSection(root, userKey, kind);
  return slice ? { ...defaults, ...slice } : { ...defaults };
}

/**
 * @param {string|null|undefined} userId
 * @param {'invoices'|'clients'|'expenses'} kind
 * @param {Record<string, unknown>} value
 */
export function writeListFilters(userId, kind, value) {
  const userKey = userId || "_guest";
  let root = readRoot();
  if (migrateLegacyIntoRoot(root)) {
    writeRoot(root);
  }
  if (!root.users[userKey]) root.users[userKey] = {};
  root.users[userKey][kind] = value;
  writeRoot(root);
}

/**
 * True if this user has a stored slice for `kind` (after legacy migration).
 * @param {string|null|undefined} userId
 * @param {'invoices'|'clients'|'expenses'} kind
 */
export function hasLocalListFilters(userId, kind) {
  const userKey = userId || "_guest";
  let root = readRoot();
  if (migrateLegacyIntoRoot(root)) {
    writeRoot(root);
  }
  const slice = pickSection(root, userKey, kind);
  return slice != null && typeof slice === "object";
}
