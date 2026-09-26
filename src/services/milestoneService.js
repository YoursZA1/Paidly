/**
 * Milestone detection for Done States. Celebrations are rare on purpose:
 * first invoice/quote (subtle), first payment (strong), lifetime collection thresholds (milestone).
 * Each milestone celebrates once per organization on this device.
 */
import { supabase } from "@/lib/supabaseClient";
import { CELEBRATION, creationCelebration, paymentMilestone } from "@shared/ux/doneStates.js";

const STORAGE_PREFIX = "paidly:milestone:";

function alreadyCelebrated(scope, key) {
  try {
    return globalThis.localStorage?.getItem(`${STORAGE_PREFIX}${scope}:${key}`) === "1";
  } catch {
    return false;
  }
}

function rememberCelebrated(scope, key) {
  try {
    globalThis.localStorage?.setItem(`${STORAGE_PREFIX}${scope}:${key}`, "1");
  } catch {
    /* storage blocked — worst case the milestone shows again */
  }
}

/**
 * Call after a payment is confirmed. Reads the org's paid invoice payments (RLS-scoped).
 * @returns {Promise<{ level: string, kind: string, threshold?: number } | null>}
 */
export async function detectPaymentMilestone({ amount }) {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("org_id, amount")
      .eq("status", "paid")
      .limit(20000);
    if (error || !Array.isArray(data) || !data.length) return null;
    const collectedAfter = data.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const received = Number(amount) || 0;
    const milestone = paymentMilestone({
      paidCountBefore: data.length - 1,
      collectedBefore: collectedAfter - received,
      collectedAfter,
    });
    if (!milestone) return null;
    const scope = data[0]?.org_id || "default";
    if (alreadyCelebrated(scope, milestone.key)) return null;
    rememberCelebrated(scope, milestone.key);
    return milestone;
  } catch {
    return null;
  }
}

/**
 * Subtle acknowledgement for the first invoice or quote an organization creates.
 * @param {"invoices" | "quotes"} table
 */
export async function detectFirstDocument(table) {
  try {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
    if (error) return CELEBRATION.NONE;
    const level = creationCelebration(count);
    if (level === CELEBRATION.NONE) return level;
    if (alreadyCelebrated("default", `first:${table}`)) return CELEBRATION.NONE;
    rememberCelebrated("default", `first:${table}`);
    return level;
  } catch {
    return CELEBRATION.NONE;
  }
}
