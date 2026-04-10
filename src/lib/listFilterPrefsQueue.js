/**
 * Serializes profile list_filter_prefs updates so parallel hooks (invoices/clients/expenses)
 * do not read stale JSON and overwrite each other's keys.
 */

import { supabase } from "@/lib/supabase";

let chain = Promise.resolve();

/**
 * Read current list_filter_prefs, merge `sections` (kind -> object), write, return merged prefs.
 * @param {string} userId - auth user uuid
 * @param {Record<string, Record<string, unknown>>} sections - e.g. { invoices: { ... } }
 * @returns {Promise<Record<string, unknown>|null>} merged prefs or null on error
 */
export function queueListFilterPrefsMerge(userId, sections) {
  if (!userId || !sections || typeof sections !== "object") {
    return Promise.resolve(null);
  }

  const task = chain.then(async () => {
    const { data, error: readErr } = await supabase
      .from("profiles")
      .select("list_filter_prefs")
      .eq("id", userId)
      .maybeSingle();

    if (readErr) return null;

    const base =
      data?.list_filter_prefs && typeof data.list_filter_prefs === "object"
        ? { ...data.list_filter_prefs }
        : {};

    for (const [kind, value] of Object.entries(sections)) {
      if (value && typeof value === "object") {
        base[kind] = value;
      }
    }

    const { error: writeErr } = await supabase
      .from("profiles")
      .update({ list_filter_prefs: base })
      .eq("id", userId);

    if (writeErr) return null;
    return base;
  });

  chain = task.catch(() => null);
  return task;
}
