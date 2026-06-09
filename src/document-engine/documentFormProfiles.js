/**
 * Data-driven form profiles for document types that use the typed compose shell.
 * Field values persist under `metadata.form` on the document row.
 */
import { getTypeDef, typeLabel } from "./documentCatalog";
import {
  PERFORMANCE_COMPETENCIES,
  DEFAULT_CHECKLIST_STARTER_LABELS,
  emptyChecklistItem,
  checklistItemsFromLabels,
  serializeChecklistField,
  emptyRatingMatrix,
  serializeRatingMatrixField,
  parseChecklistField,
} from "./documentFormRichFields";

/** @typedef {"text"|"textarea"|"date"|"number"|"select"|"rating"|"rating_matrix"|"checklist"} FormFieldType */

/**
 * @typedef {Object} FormFieldDef
 * @property {string} key
 * @property {string} label
 * @property {FormFieldType} type
 * @property {string} [placeholder]
 * @property {number} [rows]
 * @property {boolean} [required]
 * @property {{ value: string, label: string }[]} [options]
 * @property {{ key: string, label: string }[]} [competencies]
 * @property {string[]} [defaultItems]
 */

/**
 * @typedef {Object} DocumentFormProfile
 * @property {string} [description]
 * @property {FormFieldDef[]} fields
 * @property {boolean} [includeLineItems]
 * @property {string} [summaryHint]
 */

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

/** Shared field groups reused across profiles. */
const F = {
  client: { key: "client_name", label: "Client", type: "text", placeholder: "Client or company name" },
  project: { key: "project_name", label: "Project name", type: "text", required: true },
  summary: { key: "summary", label: "Summary", type: "textarea", rows: 3, placeholder: "Short overview…" },
  notes: { key: "notes", label: "Notes", type: "textarea", rows: 4 },
  dueDate: { key: "due_date", label: "Due date", type: "date" },
  startDate: { key: "start_date", label: "Start date", type: "date" },
  endDate: { key: "end_date", label: "End date", type: "date" },
  effectiveDate: { key: "effective_date", label: "Effective date", type: "date" },
  expiryDate: { key: "expiry_date", label: "Expiry date", type: "date" },
  priority: { key: "priority", label: "Priority", type: "select", options: PRIORITY_OPTIONS },
  preparedBy: { key: "prepared_by", label: "Prepared by", type: "text" },
  counterparty: { key: "counterparty", label: "Counterparty", type: "text", required: true },
  employee: { key: "employee_name", label: "Employee", type: "text", required: true },
};

/** Flow-level defaults when a type has no explicit override. */
const FLOW_FORM_TEMPLATES = Object.freeze({
  signature: {
    description: "Capture parties, dates, and terms before sending for signature.",
    fields: [F.counterparty, F.effectiveDate, F.expiryDate, F.summary, { ...F.notes, label: "Key terms" }],
    summaryHint: "Ready to send for signature once details are complete.",
  },
  approval: {
    description: "Submit structured details for review and approval.",
    fields: [F.client, F.project, F.dueDate, F.priority, F.summary, F.notes],
    summaryHint: "Saved as a draft until submitted for approval.",
  },
  report: {
    description: "Record the reporting period, findings, and recommendations.",
    fields: [
      F.preparedBy,
      { key: "period_start", label: "Period start", type: "date" },
      { key: "period_end", label: "Period end", type: "date" },
      { key: "executive_summary", label: "Executive summary", type: "textarea", rows: 4 },
      { key: "findings", label: "Findings", type: "textarea", rows: 5 },
      { key: "recommendations", label: "Recommendations", type: "textarea", rows: 4 },
    ],
    summaryHint: "Publish or share once the report is approved.",
  },
  simple: {
    description: "Capture the essentials for this document.",
    fields: [F.project, F.client, F.summary, F.notes],
    summaryHint: "Complete the fields below and save your draft.",
  },
  financial: {
    description: "Add line items and totals for this financial document.",
    fields: [F.client, F.dueDate, F.summary, F.notes],
    includeLineItems: true,
    summaryHint: "Totals update automatically from line items.",
  },
});

/** Type-specific profiles (override flow defaults). */
const TYPE_FORM_PROFILES = Object.freeze({
  // ── Sales ───────────────────────────────────────────────────────────────
  proposal: {
    description: "Outline the opportunity, scope, and commercial terms.",
    fields: [
      F.client,
      F.project,
      { key: "valid_until", label: "Valid until", type: "date" },
      { key: "executive_summary", label: "Executive summary", type: "textarea", rows: 4 },
      { key: "scope", label: "Scope of work", type: "textarea", rows: 5 },
      { key: "investment", label: "Investment / pricing notes", type: "textarea", rows: 3 },
    ],
  },
  change_request: {
    description: "Describe the change, impact, and approval needed.",
    fields: [
      F.project,
      F.client,
      F.priority,
      { key: "change_description", label: "Requested change", type: "textarea", rows: 4, required: true },
      { key: "impact", label: "Impact assessment", type: "textarea", rows: 3 },
      { key: "timeline_impact", label: "Timeline impact", type: "text" },
    ],
  },
  scope_of_work: {
    fields: [
      F.client,
      F.project,
      { key: "in_scope", label: "In scope", type: "textarea", rows: 4 },
      { key: "out_of_scope", label: "Out of scope", type: "textarea", rows: 3 },
      { key: "milestones", label: "Milestones", type: "textarea", rows: 3 },
      F.dueDate,
    ],
  },

  // ── Projects ────────────────────────────────────────────────────────────
  job_card: {
    description: "Schedule on-site work with location, scope, and estimates.",
    fields: [
      F.client,
      F.project,
      { key: "site_address", label: "Site / location", type: "text", required: true },
      { key: "job_date", label: "Scheduled date", type: "date", required: true },
      { key: "work_description", label: "Work to be done", type: "textarea", rows: 4, required: true },
      { key: "materials", label: "Materials required", type: "textarea", rows: 3 },
      { key: "estimated_hours", label: "Estimated hours", type: "number" },
      { key: "assigned_to", label: "Assigned to", type: "text" },
    ],
  },
  creative_brief: {
    description: "Define objectives, audience, and deliverables for creative work.",
    fields: [
      F.project,
      F.client,
      { key: "objective", label: "Objective", type: "textarea", rows: 3, required: true },
      { key: "target_audience", label: "Target audience", type: "text" },
      { key: "key_message", label: "Key message", type: "textarea", rows: 2 },
      { key: "deliverables", label: "Deliverables", type: "textarea", rows: 3 },
      { key: "deadline", label: "Deadline", type: "date" },
      { key: "references", label: "References / inspiration", type: "textarea", rows: 3 },
    ],
  },
  project_brief: {
    fields: [
      F.project,
      F.client,
      { key: "background", label: "Background", type: "textarea", rows: 3 },
      { key: "objectives", label: "Objectives", type: "textarea", rows: 3 },
      { key: "success_criteria", label: "Success criteria", type: "textarea", rows: 3 },
      F.startDate,
      F.endDate,
    ],
  },
  job_breakdown: {
    fields: [
      F.project,
      { key: "phase", label: "Phase", type: "text" },
      { key: "tasks", label: "Tasks", type: "textarea", rows: 6 },
      { key: "dependencies", label: "Dependencies", type: "textarea", rows: 3 },
    ],
  },
  handover_document: {
    fields: [
      F.project,
      F.client,
      { key: "handover_date", label: "Handover date", type: "date" },
      { key: "delivered_items", label: "Delivered items", type: "textarea", rows: 4 },
      { key: "open_items", label: "Open items", type: "textarea", rows: 3 },
      { key: "contact", label: "Support contact", type: "text" },
    ],
  },

  // ── HR ──────────────────────────────────────────────────────────────────
  employment_contract: {
    fields: [
      F.employee,
      { key: "role_title", label: "Role / title", type: "text", required: true },
      F.startDate,
      { key: "compensation", label: "Compensation", type: "text" },
      { key: "reporting_to", label: "Reports to", type: "text" },
      { key: "contract_terms", label: "Contract terms", type: "textarea", rows: 6 },
    ],
  },
  offer_letter: {
    fields: [
      F.employee,
      { key: "role_title", label: "Position", type: "text", required: true },
      F.startDate,
      { key: "compensation", label: "Compensation package", type: "text" },
      { key: "offer_expiry", label: "Offer expires", type: "date" },
      { key: "letter_body", label: "Offer details", type: "textarea", rows: 6 },
    ],
  },
  performance_review: {
    description: "Structured review with competency ratings, feedback, and goals.",
    summaryHint: "Complete ratings and narrative feedback before submitting for sign-off.",
    fields: [
      F.employee,
      { key: "review_period", label: "Review period", type: "text", placeholder: "e.g. Jan–Jun 2026", required: true },
      { key: "reviewer", label: "Reviewer / manager", type: "text" },
      { key: "overall_rating", label: "Overall performance", type: "rating", required: true },
      {
        key: "competency_ratings",
        label: "Competency ratings",
        type: "rating_matrix",
        competencies: PERFORMANCE_COMPETENCIES,
      },
      { key: "strengths", label: "Key strengths", type: "textarea", rows: 3 },
      { key: "improvements", label: "Areas for improvement", type: "textarea", rows: 3 },
      { key: "goals", label: "Goals for next period", type: "textarea", rows: 4 },
      { key: "employee_comments", label: "Employee comments", type: "textarea", rows: 3 },
    ],
  },

  // ── Operations ──────────────────────────────────────────────────────────
  sop: {
    fields: [
      { key: "process_name", label: "Process name", type: "text", required: true },
      { key: "version", label: "Version", type: "text", placeholder: "1.0" },
      { key: "purpose", label: "Purpose", type: "textarea", rows: 3 },
      { key: "procedure", label: "Procedure steps", type: "textarea", rows: 8 },
    ],
  },
  checklist: {
    description: "Track completion with an interactive checklist.",
    summaryHint: "Check off items as you go — progress saves with the document.",
    fields: [
      { key: "checklist_name", label: "Checklist name", type: "text", required: true },
      { key: "owner", label: "Owner", type: "text" },
      { key: "due_date", label: "Due date", type: "date" },
      {
        key: "items",
        label: "Checklist items",
        type: "checklist",
        defaultItems: DEFAULT_CHECKLIST_STARTER_LABELS,
      },
    ],
  },
  inspection_report: {
    fields: [
      { key: "inspection_date", label: "Inspection date", type: "date", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "inspector", label: "Inspector", type: "text" },
      {
        key: "inspection_points",
        label: "Inspection points",
        type: "checklist",
        defaultItems: [
          "Work area clean and accessible",
          "Equipment inspected and safe",
          "PPE available and in use",
          "Documentation on site",
          "Non-conformances recorded",
        ],
      },
      { key: "findings", label: "Additional findings", type: "textarea", rows: 4 },
      { key: "actions", label: "Required actions", type: "textarea", rows: 3 },
    ],
  },
  incident_report: {
    fields: [
      { key: "incident_date", label: "Incident date", type: "date", required: true },
      { key: "location", label: "Location", type: "text" },
      { key: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
      { key: "description", label: "What happened", type: "textarea", rows: 5, required: true },
      { key: "actions_taken", label: "Actions taken", type: "textarea", rows: 4 },
    ],
  },
  delivery_note: {
    fields: [
      F.client,
      { key: "delivery_date", label: "Delivery date", type: "date", required: true },
      { key: "delivery_address", label: "Delivery address", type: "text" },
      { key: "items_delivered", label: "Items delivered", type: "textarea", rows: 5 },
      { key: "received_by", label: "Received by", type: "text" },
    ],
  },

  // ── Events ──────────────────────────────────────────────────────────────
  event_brief: {
    fields: [
      { key: "event_name", label: "Event name", type: "text", required: true },
      { key: "event_date", label: "Event date", type: "date" },
      { key: "venue", label: "Venue", type: "text" },
      { key: "audience_size", label: "Expected audience", type: "number" },
      { key: "objectives", label: "Objectives", type: "textarea", rows: 4 },
    ],
  },
  run_sheet: {
    fields: [
      { key: "event_name", label: "Event name", type: "text", required: true },
      { key: "event_date", label: "Event date", type: "date" },
      { key: "schedule", label: "Run sheet schedule", type: "textarea", rows: 10, placeholder: "Time · Activity · Owner" },
    ],
  },
  sponsorship_proposal: {
    fields: [
      F.client,
      { key: "event_name", label: "Event / property", type: "text" },
      { key: "sponsorship_tier", label: "Sponsorship tier", type: "text" },
      { key: "benefits", label: "Sponsor benefits", type: "textarea", rows: 4 },
      { key: "investment", label: "Investment", type: "text" },
    ],
  },

  // ── Financial (non-invoice/quote) ─────────────────────────────────────
  purchase_order: {
    description: "Raise a PO with vendor details and line items.",
    fields: [
      { key: "vendor", label: "Vendor", type: "text", required: true },
      { key: "delivery_date", label: "Expected delivery", type: "date" },
      { key: "delivery_address", label: "Delivery address", type: "text" },
      F.notes,
    ],
    includeLineItems: true,
  },
  proforma_invoice: { includeLineItems: true, fields: [F.client, F.dueDate, F.summary, F.notes] },
  credit_note: { includeLineItems: true, fields: [F.client, { key: "reference", label: "Original invoice ref", type: "text" }, F.notes] },
  debit_note: { includeLineItems: true, fields: [F.client, { key: "reference", label: "Reference", type: "text" }, F.notes] },
  receipt: { includeLineItems: true, fields: [F.client, { key: "payment_date", label: "Payment date", type: "date" }, F.notes] },
  event_budget: { includeLineItems: true, fields: [F.project, { key: "event_name", label: "Event name", type: "text" }, F.notes] },
});

/** Types that use bespoke pages — excluded from typed compose routing. */
export const TYPED_DOCUMENT_EXCLUDED = Object.freeze([
  "invoice",
  "quote",
  "payslip",
  "leave_request",
  "expense_claim",
]);

/**
 * @param {unknown} typeKey
 * @returns {DocumentFormProfile | null}
 */
export function getDocumentFormProfile(typeKey) {
  const key = String(typeKey || "").trim();
  if (!key || TYPED_DOCUMENT_EXCLUDED.includes(key)) return null;
  const def = getTypeDef(key);
  if (!def) return null;

  const typeProfile = TYPE_FORM_PROFILES[key] || {};
  const flowKey = def.financial && !typeProfile.includeLineItems && !TYPE_FORM_PROFILES[key]
    ? "financial"
    : def.flow || "simple";
  const flowTemplate = FLOW_FORM_TEMPLATES[flowKey] || FLOW_FORM_TEMPLATES.simple;

  return {
    description: typeProfile.description || flowTemplate.description,
    summaryHint: typeProfile.summaryHint || flowTemplate.summaryHint,
    includeLineItems: Boolean(typeProfile.includeLineItems ?? flowTemplate.includeLineItems),
    fields: typeProfile.fields?.length ? typeProfile.fields : flowTemplate.fields,
  };
}

/** @param {unknown} typeKey */
export function hasDocumentFormProfile(typeKey) {
  return getDocumentFormProfile(typeKey) != null;
}

/** @param {unknown} typeKey */
export function typedDocumentTitle(typeKey) {
  return `New ${typeLabel(typeKey)}`;
}

/** @param {DocumentFormProfile} profile */
export function emptyFormValues(profile) {
  const values = {};
  for (const field of profile.fields || []) {
    switch (field.type) {
      case "select":
        values[field.key] = field.options?.[0]?.value || "";
        break;
      case "rating":
        values[field.key] = "";
        break;
      case "rating_matrix":
        values[field.key] = serializeRatingMatrixField(
          emptyRatingMatrix(field.competencies || [])
        );
        break;
      case "checklist": {
        const starter = field.defaultItems?.length
          ? checklistItemsFromLabels(field.defaultItems)
          : [emptyChecklistItem("")];
        values[field.key] = serializeChecklistField(starter);
        break;
      }
      default:
        values[field.key] = "";
    }
  }
  return values;
}

/** @param {unknown} metadata */
export function formValuesFromMetadata(metadata) {
  const form = metadata && typeof metadata === "object" ? metadata.form : null;
  if (!form || typeof form !== "object") return {};
  return { ...form };
}

/**
 * @param {string} typeKey
 * @param {Record<string, string>} values
 * @param {DocumentFormProfile} profile
 */
export function buildDocumentTitleFromForm(typeKey, values, profile) {
  const v = values || {};
  const candidates = [
    v.project_name,
    v.event_name,
    v.process_name,
    v.checklist_name,
    v.employee_name,
    v.client_name,
    v.counterparty,
    v.vendor,
    v.summary,
  ].filter(Boolean);
  if (candidates[0]) return `${typeLabel(typeKey)} — ${String(candidates[0]).slice(0, 80)}`;
  return `New ${typeLabel(typeKey)}`;
}

/** @param {{ typeKey: string, values: Record<string, string>, profile: DocumentFormProfile }} args */
export function formMetadataFromValues({ values, profile }) {
  const notes = values?.notes?.trim() || values?.letter_body?.trim() || values?.procedure?.trim() || null;
  return {
    form: { ...values },
    ...(notes ? { body_excerpt: notes.slice(0, 200) } : {}),
  };
}

/** Merge saved metadata onto profile defaults. */
export function resolveFormState(typeKey, metadata) {
  const profile = getDocumentFormProfile(typeKey);
  if (!profile) return { profile: null, values: {} };
  return {
    profile,
    values: { ...emptyFormValues(profile), ...formValuesFromMetadata(metadata) },
  };
}

/** @param {DocumentFormProfile} profile @param {Record<string, string>} values */
export function validateFormValues(profile, values) {
  for (const field of profile.fields || []) {
    if (!field.required) continue;
    if (field.type === "checklist") {
      const items = parseChecklistField(values?.[field.key]);
      if (!items.some((item) => item.label.trim())) {
        return `${field.label} needs at least one item`;
      }
      continue;
    }
    const val = String(values?.[field.key] ?? "").trim();
    if (!val) return `${field.label} is required`;
  }
  return null;
}
