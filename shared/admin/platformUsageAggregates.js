/**
 * Public shapes for admin usage pages.
 * Status and method totals only — never a business, document, or payment id.
 */

import { money } from "./adminPlatformDirectory.js";
import { successRate } from "./adminPlatformMetrics.js";

const INVOICE_LABELS = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
  unknown: "Unknown",
};

export function invoiceStatusRows(counts) {
  return (counts || [])
    .map((row) => {
      const status = String(row.status || "unknown").toLowerCase();
      const count = Number(row.status_count ?? row.count ?? 0) || 0;
      return {
        id: `invoice-status-${status}`,
        title: INVOICE_LABELS[status] || status,
        status,
        extra: count.toLocaleString("en-ZA"),
        count,
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function posUsageRows(buckets) {
  const byStatus = new Map();
  const byMethod = new Map();
  for (const row of buckets || []) {
    const count = Number(row.sale_count ?? row.count ?? 0) || 0;
    const status = String(row.status || "unknown").toLowerCase();
    const method = String(row.payment_method || "unknown").toLowerCase();
    byStatus.set(status, (byStatus.get(status) || 0) + count);
    byMethod.set(method, (byMethod.get(method) || 0) + count);
  }
  const statusRows = [...byStatus.entries()].map(([status, count]) => ({
    id: `pos-status-${status}`,
    title: status,
    status,
    extra: "Status",
    count,
  }));
  const methodRows = [...byMethod.entries()].map(([method, count]) => ({
    id: `pos-method-${method}`,
    title: method,
    status: "method",
    extra: "Method",
    count,
  }));
  return [...statusRows, ...methodRows].filter((row) => row.count > 0).sort((a, b) => b.count - a.count);
}

export function saasLedgerRows(buckets, { includeAmounts = false, status = null } = {}) {
  const wanted = status ? String(status).toLowerCase() : null;
  const grouped = new Map();
  for (const row of buckets || []) {
    const paymentStatus = String(row.payment_status || "unknown").toLowerCase();
    if (wanted && paymentStatus !== wanted) continue;
    const method = String(row.payment_method || "payfast").toLowerCase();
    const key = `${paymentStatus}|${method}`;
    const current = grouped.get(key) || {
      status: paymentStatus,
      method,
      count: 0,
      volume: new Map(),
    };
    const count = Number(row.payment_count ?? row.count ?? 0) || 0;
    current.count += count;
    if (includeAmounts) {
      const currency = String(row.currency || "ZAR").toUpperCase();
      current.volume.set(currency, money((current.volume.get(currency) || 0) + money(row.amount_sum ?? row.amount)));
    }
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((row) => {
      const out = {
        id: `saas-${row.status}-${row.method}`,
        title: row.status,
        status: row.status,
        extra: row.method,
        count: row.count,
      };
      if (includeAmounts) {
        const zar = row.volume.get("ZAR");
        out.amount = zar == null ? 0 : zar;
      }
      return out;
    });
}

export function saasLedgerUsage(rows) {
  let total = 0;
  let successful = 0;
  let failed = 0;
  for (const row of rows || []) {
    const count = Number(row.count || 0);
    total += count;
    if (row.status === "completed" || row.status === "paid") successful += count;
    if (row.status === "failed") failed += count;
  }
  return {
    total,
    successful,
    failed,
    successRate: successRate(successful, total),
  };
}
