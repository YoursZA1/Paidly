/**
 * One current subscription per business.
 *
 * Ownership is the company when `company_id` is set. A row with no company belongs to its
 * `user_id`. When a user has subscriptions on exactly one company, their company-less rows are
 * earlier records of that same business (company_id was missing), not a second business.
 * Email is never the owner key.
 *
 * Rank, highest first: active, trialing, pending, free access, then the latest remaining state.
 * Tie-break is updated_at, then created_at, then id. Not database return order.
 */

import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";

const LIVE_STATUSES = new Set([
  SUBSCRIPTION_STATUS.ACTIVE,
  SUBSCRIPTION_STATUS.TRIALING,
  SUBSCRIPTION_STATUS.PAST_DUE,
  SUBSCRIPTION_STATUS.SUSPENDED,
]);

function time(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function statusOf(row) {
  return coerceSubscriptionStatus(row?.status);
}

/**
 * @param {object | null | undefined} row
 * @param {Date} [now]
 */
export function freeAccessIsOpen(row, now = new Date()) {
  if (!row || row.free_access !== true) return false;
  if (statusOf(row) === SUBSCRIPTION_STATUS.SUSPENDED) return false;
  if (row.free_access_until == null || row.free_access_until === "") return true;
  const until = new Date(row.free_access_until).getTime();
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * @param {object | null | undefined} row
 * @param {Date} [now]
 */
export function currentSubscriptionRank(row, now = new Date()) {
  const st = statusOf(row);
  if (st === SUBSCRIPTION_STATUS.ACTIVE) return 100;
  if (st === SUBSCRIPTION_STATUS.TRIALING) return 80;
  if (st === SUBSCRIPTION_STATUS.PENDING || st === SUBSCRIPTION_STATUS.PROCESSING) return 60;
  if (freeAccessIsOpen(row, now)) return 50;
  if (st === SUBSCRIPTION_STATUS.PAST_DUE) return 40;
  if (st === SUBSCRIPTION_STATUS.SUSPENDED) return 35;
  if (st === SUBSCRIPTION_STATUS.EXPIRED) return 20;
  if (st === SUBSCRIPTION_STATUS.CANCELLED) return 10;
  if (st === SUBSCRIPTION_STATUS.FAILED) return 5;
  return 0;
}

function compareCurrent(a, b, now) {
  const rank = currentSubscriptionRank(b, now) - currentSubscriptionRank(a, now);
  if (rank !== 0) return rank;
  const updated = time(b?.updated_at) - time(a?.updated_at);
  if (updated !== 0) return updated;
  const created = time(b?.created_at) - time(a?.created_at);
  if (created !== 0) return created;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

/**
 * @param {object[]} rows
 * @param {Date} [now]
 */
export function pickCurrentSubscriptionRow(rows, now = new Date()) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const flagged = rows.filter((row) => row?.is_current === true);
  const pool = flagged.length > 0 ? flagged : rows;
  return [...pool].sort((a, b) => compareCurrent(a, b, now))[0] || null;
}

function hasPayfastAgreement(row) {
  return Boolean(String(row?.payfast_token || "").trim() || String(row?.payfast_subscription_id || "").trim());
}

/**
 * Group rows into one owner each.
 * @param {object[]} rows
 * @returns {{ key: string, rows: object[], invalid: object[] }[]}
 */
export function groupSubscriptionsByOwner(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const byCompany = new Map();
  const orphans = [];
  const invalid = [];

  for (const row of list) {
    const companyId = String(row.company_id || "").trim();
    if (companyId) {
      const key = `company:${companyId}`;
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key).push(row);
      continue;
    }
    const userId = String(row.user_id || "").trim();
    if (!userId) {
      invalid.push(row);
      continue;
    }
    orphans.push(row);
  }

  const companiesByUser = new Map();
  for (const [key, group] of byCompany) {
    for (const row of group) {
      const userId = String(row.user_id || "").trim();
      if (!userId) continue;
      if (!companiesByUser.has(userId)) companiesByUser.set(userId, new Set());
      companiesByUser.get(userId).add(key);
    }
  }

  const byUser = new Map();
  for (const row of orphans) {
    const userId = String(row.user_id || "").trim();
    const companies = companiesByUser.get(userId);
    if (companies && companies.size === 1) {
      byCompany.get([...companies][0]).push(row);
      continue;
    }
    const key = `user:${userId}`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(row);
  }

  const groups = [];
  for (const [key, groupRows] of byCompany) groups.push({ key, rows: groupRows, invalid });
  for (const [key, groupRows] of byUser) groups.push({ key, rows: groupRows, invalid });
  if (groups.length === 0 && invalid.length) groups.push({ key: null, rows: [], invalid });
  else if (groups.length > 0) groups[0].invalid = invalid;
  return groups.length ? groups : [];
}

/**
 * Current row per owner, plus history and data-health counts.
 * Historical rows are not duplicates. Two rows flagged current for one owner are.
 * @param {object[]} rows
 * @param {Date} [now]
 */
export function partitionCurrentSubscriptions(rows, now = new Date()) {
  const grouped = groupSubscriptionsByOwner(rows);
  const invalid = grouped[0]?.invalid || [];
  const current = [];
  let duplicateCurrent = 0;
  let multipleHistorical = 0;

  for (const group of grouped) {
    if (!group.key || group.rows.length === 0) continue;
    const picked = pickCurrentSubscriptionRow(group.rows, now);
    if (!picked) continue;
    const history = group.rows.filter((row) => row.id !== picked.id);
    const flagged = group.rows.filter((row) => row.is_current === true);
    if (flagged.length > 1) duplicateCurrent += 1;
    if (history.length > 1) multipleHistorical += 1;
    current.push({
      ...picked,
      history_count: history.length,
      _ownerKey: group.key,
    });
  }

  const invalidIds = new Set(invalid.map((row) => row?.id).filter(Boolean));
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || invalidIds.has(row.id)) continue;
    if (row.status != null && String(row.status).trim() && !statusOf(row)) {
      invalid.push(row);
      invalidIds.add(row.id);
    }
  }

  return {
    current,
    duplicateCurrent,
    multipleHistorical,
    invalid: invalid.length,
  };
}

/**
 * Before inserting a checkout row: reuse a pending checkout, or a token-less cancelled shell,
 * so repeated subscribe attempts do not create another subscription.
 * A live trial / active agreement is left in place.
 * @param {object[]} rows
 * @param {Date} [now]
 * @returns {{ row: object | null, mode: "pending" | "shell" | "replace" | "insert" }}
 */
export function findReusableCheckoutRow(rows, now = new Date()) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const pending = [...list]
    .filter((row) => {
      const st = statusOf(row);
      return st === SUBSCRIPTION_STATUS.PENDING || st === SUBSCRIPTION_STATUS.PROCESSING;
    })
    .sort((a, b) => compareCurrent(a, b, now))[0];
  if (pending) return { row: pending, mode: "pending" };

  const current = pickCurrentSubscriptionRow(list, now);
  const live =
    Boolean(current) &&
    (LIVE_STATUSES.has(statusOf(current)) || freeAccessIsOpen(current, now));

  const shells = list
    .filter((row) => row !== current && row.id !== current?.id)
    .filter((row) => !hasPayfastAgreement(row))
    .filter((row) => {
      const st = statusOf(row);
      return (
        st === SUBSCRIPTION_STATUS.CANCELLED ||
        st === SUBSCRIPTION_STATUS.FAILED ||
        st === SUBSCRIPTION_STATUS.EXPIRED
      );
    })
    .sort((a, b) => compareCurrent(a, b, now));

  if (live && shells[0]) return { row: shells[0], mode: "shell" };

  if (current && !live && !hasPayfastAgreement(current)) {
    return { row: current, mode: "replace" };
  }

  return { row: null, mode: "insert" };
}
