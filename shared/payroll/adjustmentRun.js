// @ts-check

/**
 * Unpaid leave approved after finalize must not rewrite the locked run.
 * These helpers decide whether an adjustment run is still outstanding.
 */

/**
 * @param {Array<{ pay_run_ids?: unknown }>} [signals]
 * @param {Array<{ original_pay_run_id?: unknown, status?: unknown }>} [adjustmentRuns]
 */
export function outstandingAdjustmentSignals(signals = [], adjustmentRuns = []) {
  const covered = new Set(
    (adjustmentRuns || [])
      .filter((row) => row?.original_pay_run_id && String(row.status || "") !== "cancelled")
      .map((row) => String(row.original_pay_run_id))
  );
  return (signals || []).filter((signal) => {
    const ids = Array.isArray(signal?.pay_run_ids) ? signal.pay_run_ids.map(String).filter(Boolean) : [];
    if (!ids.length) return true;
    return ids.some((id) => !covered.has(id));
  });
}

/**
 * @param {Array<{ pay_run_ids?: unknown }>} [signals]
 * @returns {string[]}
 */
export function uncoveredPayRunIds(signals = []) {
  const ids = [];
  const seen = new Set();
  for (const signal of signals || []) {
    for (const raw of Array.isArray(signal?.pay_run_ids) ? signal.pay_run_ids : []) {
      const id = String(raw || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * @param {unknown} payRunId
 * @param {Array<{ pay_run_ids?: unknown }>} [signals]
 */
export function payRunNeedsAdjustment(payRunId, signals = []) {
  const id = String(payRunId || "").trim();
  if (!id) return false;
  return (signals || []).some((signal) =>
    (Array.isArray(signal?.pay_run_ids) ? signal.pay_run_ids : []).map(String).includes(id)
  );
}
