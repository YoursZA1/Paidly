/**
 * One view of a purchase order for the preview, PDF, print and supplier email, so all four show the
 * same lines and totals. Prefers the database-computed amounts; falls back to the shared math for rows
 * written before 20261006120000 added them.
 */
import { format, parseISO, isValid } from "date-fns";
import {
  PO_STATUS_LABEL,
  purchaseOrderFinancials,
  purchaseOrderLineAmounts,
  purchaseOrderTotals,
} from "@shared/procurement/purchaseOrderMath.js";

export function formatPoDate(value, pattern = "dd MMMM yyyy") {
  if (!value) return "";
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? format(d, pattern) : "";
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const hasStoredAmounts = (item) => item?.line_total != null && !(num(item.line_total) === 0 && num(item.quantity_ordered) * num(item.unit_cost) > 0);

export function buildPurchaseOrderDocumentModel({ purchaseOrder, items = [], supplier = null, business = null, productsById = null } = {}) {
  const po = purchaseOrder || {};
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => num(a.sort_order) - num(b.sort_order));

  const lines = sorted.map((item) => {
    const product = item.product_id ? productsById?.get?.(item.product_id) : null;
    const computed = purchaseOrderLineAmounts(item);
    const stored = hasStoredAmounts(item);
    const description = String(item.description || "").trim();
    const name = product?.name || description || "Item";
    return {
      id: item.id,
      name,
      detail: product?.name && description && description !== product.name ? description : "",
      sku: product?.sku || "",
      quantity: num(item.quantity_ordered),
      quantityReceived: num(item.quantity_received),
      unitPrice: num(item.unit_cost),
      discountPercent: num(item.discount_percent),
      vatRate: num(item.vat_rate),
      vat: stored ? num(item.line_vat) : computed.vat,
      total: stored ? num(item.line_total) : computed.total,
    };
  });

  const fallback = purchaseOrderTotals(sorted);
  const storedTotals = po.total_amount != null && (num(po.total_amount) > 0 || fallback.total === 0);
  const totals = storedTotals
    ? {
        subtotal: num(po.subtotal),
        discountTotal: num(po.discount_total),
        vatTotal: num(po.vat_total),
        total: num(po.total_amount),
      }
    : fallback;

  return {
    number: po.po_number || "",
    status: po.status || "draft",
    statusLabel: PO_STATUS_LABEL[po.status] || "Draft",
    currency: po.currency || business?.currency || "ZAR",
    orderDate: formatPoDate(po.order_date || po.created_at),
    expectedDate: formatPoDate(po.expected_date),
    paymentTerms: po.payment_terms || supplier?.payment_terms || "",
    dueDate: formatPoDate(po.due_date),
    dueDateIso: po.due_date ? String(po.due_date).slice(0, 10) : null,
    deliveryAddress: po.delivery_address || business?.address || "",
    deliveryInstructions: po.delivery_instructions || "",
    notes: po.notes || "",
    terms: po.terms || "",
    supplier: supplier
      ? {
          name: supplier.name || "",
          email: supplier.email || "",
          phone: supplier.phone || "",
          address: supplier.address || "",
          taxNumber: supplier.tax_number || "",
        }
      : null,
    business: business
      ? {
          name: business.name || "",
          address: business.address || "",
          email: business.email || "",
          phone: business.phone || "",
          vatNumber: business.vatNumber || "",
          logo: business.logo || "",
        }
      : null,
    lines,
    hasDiscount: lines.some((l) => l.discountPercent > 0),
    totals,
    financials: purchaseOrderFinancials({ ...po, total_amount: totals.total }),
  };
}

/** Status history from the PO's own timestamps plus recorded payments. */
export function buildPurchaseOrderHistory(purchaseOrder, payments = []) {
  const po = purchaseOrder || {};
  const events = [];
  if (po.created_at) events.push({ key: "created", label: "Created as draft", at: po.created_at });
  if (po.submitted_at) events.push({ key: "submitted", label: "Submitted for approval", at: po.submitted_at });
  if (po.approved_at) events.push({ key: "approved", label: "Approved — spending committed", at: po.approved_at });
  if (po.sent_at) events.push({ key: "sent", label: `Sent to supplier${po.sent_to_email ? ` (${po.sent_to_email})` : ""}`, at: po.sent_at });
  if (po.received_at) {
    events.push({ key: "received", label: "All goods received", at: po.received_at });
  } else if (po.last_received_at) {
    events.push({ key: "partial", label: "Goods partly received", at: po.last_received_at });
  }
  for (const p of Array.isArray(payments) ? payments : []) {
    events.push({ key: `pay-${p.id}`, label: "Supplier paid", at: p.date || p.created_at, dateOnly: Boolean(p.date), amount: num(p.amount) });
  }
  if (po.cancelled_at) {
    events.push({ key: "cancelled", label: po.cancellation_reason ? `Cancelled — ${po.cancellation_reason}` : "Cancelled", at: po.cancelled_at });
  }
  return events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

const EVENT_LABEL = {
  created: "Created as draft",
  draft_saved: "Draft saved",
  edited: "Edited",
  submitted: "Submitted for approval",
  returned_to_draft: "Returned to draft",
  approved: "Approved — spending committed",
  goods_received: "Goods received",
  fully_received: "All goods received",
  sent_to_supplier: "Sent to supplier",
  payment_recorded: "Supplier payment recorded",
  payment_changed: "Supplier payment changed",
  payment_removed: "Supplier payment removed",
  cancelled: "Cancelled",
};

/**
 * History from the audit trail (purchase_order_events). Each entry: label, detail, at, amount, actorId.
 * Falls back to buildPurchaseOrderHistory when there are no events (e.g. before the trail existed).
 */
export function buildPurchaseOrderEventHistory(events = [], purchaseOrder = null, payments = []) {
  if (!Array.isArray(events) || events.length === 0) return buildPurchaseOrderHistory(purchaseOrder, payments);
  return events.map((ev) => {
    const md = ev.metadata || {};
    let detail = "";
    if (ev.action === "goods_received") {
      detail = `${md.item || "Item"}: ${num(md.quantity)} received · ${num(md.remaining)} remaining`;
    } else if (ev.action === "sent_to_supplier") {
      detail = md.email || "";
    } else if (ev.action === "returned_to_draft" || ev.action === "cancelled") {
      detail = md.reason || "";
    } else if (ev.action === "draft_saved" || ev.action === "edited") {
      detail = Array.isArray(md.fields) && md.fields.length ? `Changed: ${md.fields.join(", ").replace(/_/g, " ")}` : "";
    } else if (ev.action.startsWith("payment_")) {
      detail = [md.expense_number, md.method && String(md.method).replace(/_/g, " "), md.reference && `Ref ${md.reference}`]
        .filter(Boolean)
        .join(" · ");
    }
    return {
      key: ev.id,
      label: EVENT_LABEL[ev.action] || ev.action,
      detail,
      at: ev.created_at,
      amount: ev.action.startsWith("payment_") ? num(md.amount) : null,
      actorId: ev.actor_id || null,
    };
  });
}
