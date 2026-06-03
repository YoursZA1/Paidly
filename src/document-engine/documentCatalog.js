/**
 * Paidly Document Engine — business document catalog (data-driven).
 *
 * The catalog is the single source of truth for every document KIND the hub supports. It is
 * intentionally data-driven so new document types plug in here (and in the `document_types` /
 * `document_categories` seed migration) without new code paths or new database tables — the
 * `public.documents` table is polymorphic (`type` + `category_key` + `metadata`/`body`).
 *
 * Status-flow groups map a type to its lifecycle vocabulary:
 *   - financial: line-item money documents (invoice, quote, PO, receipt, …)
 *   - signature: documents that get signed (contracts, NDAs, offer letters, …)
 *   - approval:  documents that route for approval (job cards, leave requests, …)
 *   - report:    generated/observed reports
 *   - simple:    lightweight prose/checklist documents
 */

/** @typedef {"financial"|"signature"|"approval"|"report"|"simple"} DocumentStatusFlow */

export const DOCUMENT_CATEGORIES = Object.freeze([
  { key: "financial", label: "Financial", icon: "Receipt", order: 1 },
  { key: "sales", label: "Sales & Client", icon: "Handshake", order: 2 },
  { key: "projects", label: "Projects", icon: "FolderKanban", order: 3 },
  { key: "hr", label: "HR", icon: "Users", order: 4 },
  { key: "operations", label: "Operations", icon: "Settings2", order: 5 },
  { key: "reports", label: "Reports", icon: "BarChart3", order: 6 },
  { key: "events", label: "Events", icon: "CalendarDays", order: 7 },
]);

/**
 * Every supported document type. `financial: true` means the document carries line items + totals
 * and participates in revenue/value rollups. Non-financial types use `body` (prose) + attachments.
 */
export const DOCUMENT_TYPE_DEFS = Object.freeze([
  // ── Financial ───────────────────────────────────────────────────────────
  { key: "invoice", label: "Invoice", category: "financial", icon: "FileText", financial: true, flow: "financial" },
  { key: "quote", label: "Quote", category: "financial", icon: "FileText", financial: true, flow: "financial" },
  { key: "proforma_invoice", label: "Proforma Invoice", category: "financial", icon: "FileText", financial: true, flow: "financial" },
  { key: "credit_note", label: "Credit Note", category: "financial", icon: "FileMinus", financial: true, flow: "financial" },
  { key: "debit_note", label: "Debit Note", category: "financial", icon: "FilePlus", financial: true, flow: "financial" },
  { key: "receipt", label: "Receipt", category: "financial", icon: "ReceiptText", financial: true, flow: "financial" },
  { key: "purchase_order", label: "Purchase Order", category: "financial", icon: "ShoppingCart", financial: true, flow: "approval" },
  { key: "expense_claim", label: "Expense Claim", category: "financial", icon: "Wallet", financial: true, flow: "approval" },

  // ── Sales & Client ──────────────────────────────────────────────────────
  { key: "proposal", label: "Proposal", category: "sales", icon: "Lightbulb", financial: false, flow: "signature" },
  { key: "contract", label: "Contract", category: "sales", icon: "FileSignature", financial: false, flow: "signature" },
  { key: "service_agreement", label: "Service Agreement", category: "sales", icon: "FileSignature", financial: false, flow: "signature" },
  { key: "scope_of_work", label: "Scope of Work", category: "sales", icon: "ListChecks", financial: false, flow: "signature" },
  { key: "nda", label: "NDA", category: "sales", icon: "ShieldCheck", financial: false, flow: "signature" },
  { key: "retainer_agreement", label: "Retainer Agreement", category: "sales", icon: "FileSignature", financial: false, flow: "signature" },
  { key: "change_request", label: "Change Request", category: "sales", icon: "GitBranch", financial: false, flow: "approval" },

  // ── Projects ──────────────────────────────────────────────────────────────
  { key: "job_card", label: "Job Card", category: "projects", icon: "ClipboardList", financial: false, flow: "approval" },
  { key: "job_breakdown", label: "Job Breakdown", category: "projects", icon: "ListTree", financial: false, flow: "simple" },
  { key: "creative_brief", label: "Creative Brief", category: "projects", icon: "Palette", financial: false, flow: "simple" },
  { key: "project_brief", label: "Project Brief", category: "projects", icon: "FolderKanban", financial: false, flow: "simple" },
  { key: "status_report", label: "Status Report", category: "projects", icon: "Activity", financial: false, flow: "report" },
  { key: "handover_document", label: "Handover Document", category: "projects", icon: "PackageCheck", financial: false, flow: "approval" },

  // ── HR ──────────────────────────────────────────────────────────────────
  { key: "payslip", label: "Payslip", category: "hr", icon: "DollarSign", financial: true, flow: "financial" },
  { key: "employment_contract", label: "Employment Contract", category: "hr", icon: "FileSignature", financial: false, flow: "signature" },
  { key: "offer_letter", label: "Offer Letter", category: "hr", icon: "Mail", financial: false, flow: "signature" },
  { key: "leave_request", label: "Leave Request", category: "hr", icon: "CalendarOff", financial: false, flow: "approval" },
  { key: "performance_review", label: "Performance Review", category: "hr", icon: "Star", financial: false, flow: "approval" },

  // ── Operations ────────────────────────────────────────────────────────────
  { key: "sop", label: "SOP", category: "operations", icon: "BookOpen", financial: false, flow: "simple" },
  { key: "checklist", label: "Checklist", category: "operations", icon: "ListChecks", financial: false, flow: "simple" },
  { key: "inspection_report", label: "Inspection Report", category: "operations", icon: "ClipboardCheck", financial: false, flow: "report" },
  { key: "incident_report", label: "Incident Report", category: "operations", icon: "AlertTriangle", financial: false, flow: "report" },
  { key: "delivery_note", label: "Delivery Note", category: "operations", icon: "Truck", financial: false, flow: "approval" },

  // ── Reports ───────────────────────────────────────────────────────────────
  { key: "revenue_report", label: "Revenue Report", category: "reports", icon: "TrendingUp", financial: false, flow: "report" },
  { key: "client_report", label: "Client Report", category: "reports", icon: "Users", financial: false, flow: "report" },
  { key: "sales_report", label: "Sales Report", category: "reports", icon: "BarChart3", financial: false, flow: "report" },
  { key: "expense_report", label: "Expense Report", category: "reports", icon: "PieChart", financial: false, flow: "report" },
  { key: "project_report", label: "Project Report", category: "reports", icon: "FolderKanban", financial: false, flow: "report" },
  { key: "marketing_report", label: "Marketing Report", category: "reports", icon: "Megaphone", financial: false, flow: "report" },

  // ── Events ────────────────────────────────────────────────────────────────
  { key: "event_brief", label: "Event Brief", category: "events", icon: "CalendarDays", financial: false, flow: "simple" },
  { key: "sponsorship_proposal", label: "Sponsorship Proposal", category: "events", icon: "Lightbulb", financial: false, flow: "signature" },
  { key: "event_budget", label: "Event Budget", category: "events", icon: "Wallet", financial: true, flow: "financial" },
  { key: "run_sheet", label: "Run Sheet", category: "events", icon: "ListOrdered", financial: false, flow: "simple" },
  { key: "attendance_report", label: "Attendance Report", category: "events", icon: "UserCheck", financial: false, flow: "report" },
]);

/**
 * Lifecycle status vocabulary per flow group. The first entry is always the create-time default.
 * Statuses are a superset across flows; the UI renders badges for any of them.
 */
export const STATUS_FLOWS = Object.freeze({
  financial: ["draft", "sent", "viewed", "paid", "overdue", "cancelled", "archived"],
  // quotes additionally use accept/decline/expire/convert — kept here so the engine recognizes them
  signature: ["draft", "pending", "sent", "viewed", "signed", "completed", "cancelled", "archived"],
  approval: ["draft", "pending", "approved", "sent", "completed", "cancelled", "archived"],
  report: ["draft", "pending", "approved", "completed", "archived"],
  simple: ["draft", "completed", "archived"],
});

/** Extra statuses recognized for quotes on top of the financial flow. */
const QUOTE_EXTRA_STATUSES = Object.freeze(["accepted", "declined", "expired", "converted"]);

const TYPE_BY_KEY = new Map(DOCUMENT_TYPE_DEFS.map((t) => [t.key, t]));
const CATEGORY_BY_KEY = new Map(DOCUMENT_CATEGORIES.map((c) => [c.key, c]));

/** All valid type keys. */
export const DOCUMENT_TYPE_KEYS = Object.freeze(DOCUMENT_TYPE_DEFS.map((t) => t.key));

/** @param {unknown} key */
export function isCatalogType(key) {
  return typeof key === "string" && TYPE_BY_KEY.has(key);
}

/** @param {unknown} key @returns {(typeof DOCUMENT_TYPE_DEFS)[number] | null} */
export function getTypeDef(key) {
  return TYPE_BY_KEY.get(String(key || "")) || null;
}

/** @param {unknown} key */
export function getCategoryDef(key) {
  return CATEGORY_BY_KEY.get(String(key || "")) || null;
}

/** Human label for a type key (falls back to a title-cased key). */
export function typeLabel(key) {
  const def = getTypeDef(key);
  if (def) return def.label;
  return String(key || "")
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Category key for a type (or null). */
export function categoryForType(key) {
  return getTypeDef(key)?.category || null;
}

/** Whether a type carries line items + monetary totals. */
export function isFinancialType(key) {
  return Boolean(getTypeDef(key)?.financial);
}

/** Types grouped by category, in catalog order — for the grouped "New Document" menu. */
export function typesByCategory() {
  return DOCUMENT_CATEGORIES.map((cat) => ({
    ...cat,
    types: DOCUMENT_TYPE_DEFS.filter((t) => t.category === cat.key),
  }));
}

/** Default (create-time) status for a type. */
export function defaultStatusForCatalogType(key) {
  const def = getTypeDef(key);
  const flow = def?.flow || "financial";
  return STATUS_FLOWS[flow]?.[0] || "draft";
}

/** All statuses a type can legitimately hold. */
export function allowedStatusesForType(key) {
  const def = getTypeDef(key);
  const flow = def?.flow || "financial";
  const base = STATUS_FLOWS[flow] || STATUS_FLOWS.financial;
  if (key === "quote") return Object.freeze([...base, ...QUOTE_EXTRA_STATUSES]);
  return base;
}
