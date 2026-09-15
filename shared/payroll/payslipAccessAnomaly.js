// @ts-check

export const PAYSLIP_OPENED_ANOMALY_THRESHOLD = 8;
export const PAYSLIP_DOWNLOADED_ANOMALY_THRESHOLD = 3;

/**
 * @param {Array<{ org_id?: unknown, source_id?: unknown, event_type?: unknown }>} events
 */
export function groupPayslipAccessEvents(events = []) {
  const byPayslip = new Map();
  for (const row of events || []) {
    const orgId = String(row?.org_id || "").trim();
    const sourceId = String(row?.source_id || "").trim();
    if (!orgId || !sourceId) continue;
    const key = `${orgId}:${sourceId}`;
    const current = byPayslip.get(key) || {
      orgId,
      payslipId: sourceId,
      opened: 0,
      clicked: 0,
      downloaded: 0,
    };
    const type = String(row?.event_type || "");
    if (type === "opened") current.opened += 1;
    else if (type === "clicked") current.clicked += 1;
    else if (type === "downloaded") current.downloaded += 1;
    byPayslip.set(key, current);
  }
  return [...byPayslip.values()];
}

export function isPayslipAccessAnomaly(counts) {
  if (!counts) return false;
  return (
    Number(counts.opened) >= PAYSLIP_OPENED_ANOMALY_THRESHOLD ||
    Number(counts.downloaded) >= PAYSLIP_DOWNLOADED_ANOMALY_THRESHOLD
  );
}
