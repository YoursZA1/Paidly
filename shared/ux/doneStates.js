/**
 * Paidly "Done Screen" standard — the policy half (pure, no React).
 *
 * Every important action ends in a deliberate done state that answers:
 *   1. What happened?            (title + reference: number, counterparty, amount)
 *   2. What happens next?        (2–3 useful actions, never just "Close")
 *   3. How important was it?     (tier: toast < panel < persistent)
 *   4. What is still pending?    ("Payment is still outstanding")
 *   5. What is the next loop?    ("Due in 14 days", "Track payment status")
 *   6. Celebrate only milestones (first invoice, first payment, collection thresholds)
 *   7. One state                 (Done → Result → Next actions → Status → Follow-up, no bouncing)
 *
 * The UI half is src/components/shared/DoneState.jsx.
 */

/** How loud the completion is. */
export const DONE_TIER = Object.freeze({
  /** Saves and small updates. */
  TOAST: "toast",
  /** A confirmation panel/dialog the user dismisses (invoice sent, quote accepted). */
  PANEL: "panel",
  /** A record the user can come back to (payment receipt, payroll summary, POS receipt). */
  PERSISTENT: "persistent",
});

export const DONE_EVENT = Object.freeze({
  RECORD_SAVED: "record_saved",
  INVOICE_CREATED: "invoice_created",
  INVOICE_SENT: "invoice_sent",
  QUOTE_CREATED: "quote_created",
  QUOTE_SENT: "quote_sent",
  QUOTE_ACCEPTED: "quote_accepted",
  PAYMENT_RECEIVED: "payment_received",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_FAILED: "payment_failed",
  REMINDER_SENT: "reminder_sent",
  RECURRING_INVOICE_GENERATED: "recurring_invoice_generated",
  PAYSLIP_GENERATED: "payslip_generated",
  PAYSLIP_SENT: "payslip_sent",
  PAYROLL_COMPLETED: "payroll_completed",
  EMPLOYEE_INVITED: "employee_invited",
  POS_SALE_COMPLETED: "pos_sale_completed",
  SUBSCRIPTION_ACTIVATED: "subscription_activated",
  SUBSCRIPTION_CHANGED: "subscription_changed",
});

const EVENT_TIER = Object.freeze({
  [DONE_EVENT.RECORD_SAVED]: DONE_TIER.TOAST,
  [DONE_EVENT.REMINDER_SENT]: DONE_TIER.TOAST,
  [DONE_EVENT.RECURRING_INVOICE_GENERATED]: DONE_TIER.TOAST,
  [DONE_EVENT.INVOICE_CREATED]: DONE_TIER.PANEL,
  [DONE_EVENT.INVOICE_SENT]: DONE_TIER.PANEL,
  [DONE_EVENT.QUOTE_CREATED]: DONE_TIER.PANEL,
  [DONE_EVENT.QUOTE_SENT]: DONE_TIER.PANEL,
  [DONE_EVENT.QUOTE_ACCEPTED]: DONE_TIER.PANEL,
  [DONE_EVENT.PAYMENT_PENDING]: DONE_TIER.PANEL,
  [DONE_EVENT.PAYMENT_FAILED]: DONE_TIER.PANEL,
  [DONE_EVENT.PAYSLIP_GENERATED]: DONE_TIER.PANEL,
  [DONE_EVENT.PAYSLIP_SENT]: DONE_TIER.PANEL,
  [DONE_EVENT.EMPLOYEE_INVITED]: DONE_TIER.PANEL,
  [DONE_EVENT.SUBSCRIPTION_CHANGED]: DONE_TIER.PANEL,
  [DONE_EVENT.PAYMENT_RECEIVED]: DONE_TIER.PERSISTENT,
  [DONE_EVENT.PAYROLL_COMPLETED]: DONE_TIER.PERSISTENT,
  [DONE_EVENT.POS_SALE_COMPLETED]: DONE_TIER.PERSISTENT,
  [DONE_EVENT.SUBSCRIPTION_ACTIVATED]: DONE_TIER.PERSISTENT,
});

export function doneTierFor(event) {
  return EVENT_TIER[event] || DONE_TIER.TOAST;
}

/** Celebration strength. Routine actions (every invoice sent, every payment) are NONE. */
export const CELEBRATION = Object.freeze({
  NONE: "none",
  SUBTLE: "subtle",
  STRONG: "strong",
  MILESTONE: "milestone",
});

/** Lifetime collected amounts (in the business currency) worth marking. */
export const COLLECTION_MILESTONES = Object.freeze([100_000, 250_000, 500_000, 1_000_000, 5_000_000, 10_000_000]);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Celebration for a received payment.
 * - first payment the business has ever received → STRONG ("First invoice paid")
 * - lifetime collected crosses a threshold      → MILESTONE (largest threshold crossed)
 * - anything else                               → null (no confetti)
 * @returns {{ level: string, key: string, kind: "first_payment" | "collected", threshold?: number } | null}
 */
export function paymentMilestone({ paidCountBefore, collectedBefore, collectedAfter }) {
  const before = num(collectedBefore);
  const after = num(collectedAfter);
  const crossed = COLLECTION_MILESTONES.filter((t) => before < t && after >= t);
  if (crossed.length) {
    const threshold = crossed[crossed.length - 1];
    return { level: CELEBRATION.MILESTONE, key: `collected:${threshold}`, kind: "collected", threshold };
  }
  if (Number.isFinite(Number(paidCountBefore)) && Number(paidCountBefore) === 0 && after > 0) {
    return { level: CELEBRATION.STRONG, key: "first_payment", kind: "first_payment" };
  }
  return null;
}

/** First invoice/quote ever created gets a quiet acknowledgement; the rest get none. */
export function creationCelebration(totalCountAfter) {
  return Number(totalCountAfter) === 1 ? CELEBRATION.SUBTLE : CELEBRATION.NONE;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Days until a due date (negative = overdue), or null when there is no valid date.
 */
export function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const ms = startOfDay(due).getTime() - startOfDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

/** "Due in 14 days" · "Due tomorrow" · "Due today" · "Overdue by 3 days" · null. */
export function dueFollowUpLabel(dueDate, now = new Date()) {
  const days = daysUntil(dueDate, now);
  if (days == null) return null;
  if (days > 1) return `Due in ${days} days`;
  if (days === 1) return "Due tomorrow";
  if (days === 0) return "Due today";
  const late = Math.abs(days);
  return `Overdue by ${late} day${late === 1 ? "" : "s"}`;
}

export const INVOICE_OUTCOME = Object.freeze({
  DRAFT: "draft",
  AWAITING_PAYMENT: "awaiting_payment",
  PARTIALLY_PAID: "partially_paid",
  PAID: "paid",
  OVERDUE: "overdue",
});

const OUTCOME_LABEL = Object.freeze({
  [INVOICE_OUTCOME.DRAFT]: "Not sent yet",
  [INVOICE_OUTCOME.AWAITING_PAYMENT]: "Awaiting payment",
  [INVOICE_OUTCOME.PARTIALLY_PAID]: "Partially paid",
  [INVOICE_OUTCOME.PAID]: "Paid in full",
  [INVOICE_OUTCOME.OVERDUE]: "Overdue",
});

/**
 * The business outcome of an invoice: the user's goal is getting paid, not sending.
 * @returns {{ outcome: string, statusLabel: string, amountDue: number, pending: boolean, followUp: string | null }}
 */
export function invoiceOutcome({ status, total, amountDue, dueDate, now = new Date() }) {
  const due = Math.max(0, num(amountDue ?? total));
  const grand = num(total);
  const s = String(status || "").trim().toLowerCase();
  let outcome;
  if (due <= 0 && grand > 0) outcome = INVOICE_OUTCOME.PAID;
  else if (s === "draft") outcome = INVOICE_OUTCOME.DRAFT;
  else if (grand > 0 && due < grand) outcome = INVOICE_OUTCOME.PARTIALLY_PAID;
  else if ((daysUntil(dueDate, now) ?? 0) < 0) outcome = INVOICE_OUTCOME.OVERDUE;
  else outcome = INVOICE_OUTCOME.AWAITING_PAYMENT;
  const paid = outcome === INVOICE_OUTCOME.PAID;
  return {
    outcome,
    statusLabel: OUTCOME_LABEL[outcome],
    amountDue: paid ? 0 : due,
    pending: !paid,
    followUp: paid ? null : dueFollowUpLabel(dueDate, now),
  };
}

/** Short amount label for milestones: 100000 → "100k", 1500000 → "1.5m". */
export function compactAmount(value) {
  const n = num(value);
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export const PAYMENT_RETURN_OUTCOME = Object.freeze({
  PAID: "paid",
  CONFIRMING: "confirming",
  NOT_COMPLETED: "not_completed",
});

/**
 * What to show when someone returns from the online payment provider.
 * The payment intent (confirmed by the provider's verified webhook) is the source of truth — a
 * success redirect alone never means paid. `result=cancel|error` from the redirect only matters
 * while the intent has not been confirmed yet.
 * @returns {{ outcome: string, tone: "success" | "pending" | "failed", event: string }}
 */
const EXPENSE_CATEGORY_LABELS = Object.freeze({
  office: "Office",
  travel: "Travel",
  utilities: "Utilities",
  inventory: "Inventory / Stock",
  supplies: "Supplies",
  equipment: "Equipment",
  salary: "Salary",
  marketing: "Marketing",
  software: "Software",
  consulting: "Consulting",
  legal: "Legal",
  maintenance: "Maintenance",
  vehicle: "Vehicle",
  meals: "Meals",
  other: "Other",
});

/**
 * What the expense-added popup should say. The business outcome is that the
 * spend is now in cash flow, not that a row was inserted.
 */
export function expenseAddedOutcome(expense = {}) {
  const vendor = String(expense.vendor || "").trim();
  const description = String(expense.description || "").trim();
  const categoryKey = String(expense.category || "").trim().toLowerCase();
  const category = EXPENSE_CATEGORY_LABELS[categoryKey] || "";
  return {
    title: "Expense added",
    counterparty: vendor || description || "Expense",
    detail: vendor && description ? description : "",
    category,
    amount: num(expense.amount),
  };
}

export function paymentReturnOutcome({ intentStatus, resultParam = null }) {
  const status = String(intentStatus || "").trim().toLowerCase();
  const result = String(resultParam || "").trim().toLowerCase();
  if (status === "paid") {
    return { outcome: PAYMENT_RETURN_OUTCOME.PAID, tone: "success", event: DONE_EVENT.PAYMENT_RECEIVED };
  }
  if (["failed", "cancelled", "expired"].includes(status) || result === "cancel" || result === "error") {
    return { outcome: PAYMENT_RETURN_OUTCOME.NOT_COMPLETED, tone: "failed", event: DONE_EVENT.PAYMENT_FAILED };
  }
  return { outcome: PAYMENT_RETURN_OUTCOME.CONFIRMING, tone: "pending", event: DONE_EVENT.PAYMENT_PENDING };
}
