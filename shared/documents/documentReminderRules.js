import { invoiceAmountDue, isConfirmedInvoicePayment } from "../payments/invoiceBalance.js";
import {
  DOCUMENT_EVENT_TYPE,
  documentEventOccurredAt,
  firstEventOfType,
  hasEventType,
} from "./documentEvents.js";

export const DEFAULT_VIEWED_NOT_PAID_WAIT_HOURS = 24;

export const DEFAULT_REMINDER_RULES = Object.freeze([
  {
    id: "upcoming-7",
    days: 7,
    type: "before",
    subject: "Friendly reminder: invoice {{invoice_number}} is due soon",
    body: "Hi {{client_name}},\n\nJust a note that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "upcoming-3",
    days: 3,
    type: "before",
    subject: "Friendly reminder: payment due soon — {{invoice_number}}",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "upcoming-1",
    days: 1,
    type: "before",
    subject: "Invoice {{invoice_number}} is due tomorrow",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due tomorrow ({{due_date}}).\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "due-today",
    days: 0,
    type: "after",
    subject: "Invoice {{invoice_number}} is due today",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due today.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "overdue-1",
    days: 1,
    type: "after",
    subject: "Follow-up: invoice {{invoice_number}}",
    body: "Hi {{client_name}},\n\nJust following up on invoice {{invoice_number}} for {{amount}}, which was due on {{due_date}}.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "overdue-3",
    days: 3,
    type: "after",
    subject: "Follow-up: invoice {{invoice_number}} is overdue",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}}.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "overdue-7",
    days: 7,
    type: "after",
    subject: "Overdue notice: invoice {{invoice_number}}",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is now overdue.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
  {
    id: "overdue-14",
    days: 14,
    type: "after",
    subject: "Overdue notice: invoice {{invoice_number}}",
    body: "Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}}.\n\nYou can review and pay securely using the link below.\n\n{{company_name}}",
  },
]);

export const VIEWED_NOT_PAID_COPY = Object.freeze({
  id: "viewed-not-paid",
  subject: "Following up on invoice {{invoice_number}}",
  body: "Just following up on invoice #{{invoice_number}}. You can review and pay securely using the link below.",
});

const CLOSED_STATUSES = new Set(["paid", "void", "cancelled", "canceled", "draft"]);

export function startOfLocalDay(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function calendarDaysFromDue(dueDate, now = new Date()) {
  const due = startOfLocalDay(dueDate);
  const today = startOfLocalDay(now);
  if (!due || !today) return null;
  return Math.round((today.getTime() - due.getTime()) / 86400000);
}

export function normalizeReminderSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rules = Array.isArray(source.reminder_rules) && source.reminder_rules.length
    ? source.reminder_rules
    : DEFAULT_REMINDER_RULES;
  const viewed = source.viewed_not_paid && typeof source.viewed_not_paid === "object"
    ? source.viewed_not_paid
    : {};
  const waitHours = Number(viewed.wait_hours);
  return {
    reminders_enabled: source.reminders_enabled !== false,
    auto_send: source.auto_send !== false,
    reminder_rules: rules,
    viewed_not_paid: {
      enabled: viewed.enabled !== false,
      wait_hours: Number.isFinite(waitHours) && waitHours >= 1 ? waitHours : DEFAULT_VIEWED_NOT_PAID_WAIT_HOURS,
    },
  };
}

export function invoiceIsRemindable(invoice, payments = []) {
  const status = String(invoice?.status || "").trim().toLowerCase();
  if (!invoice?.id || CLOSED_STATUSES.has(status)) return false;
  const amountDue = invoiceAmountDue(invoice, (payments || []).filter(isConfirmedInvoicePayment));
  return amountDue > 0.009;
}

function dueEventTypeForRule(rule) {
  if (rule.type === "before") return DOCUMENT_EVENT_TYPE.due_soon;
  if (Number(rule.days) === 0) return DOCUMENT_EVENT_TYPE.due_today;
  return DOCUMENT_EVENT_TYPE.overdue;
}

export function evaluateInvoiceReminderActions({
  invoice,
  payments = [],
  events = [],
  settings,
  now = new Date(),
} = {}) {
  const normalized = normalizeReminderSettings(settings);
  const actions = [];
  if (!invoiceIsRemindable(invoice, payments)) return actions;

  const dueRaw = invoice.delivery_date || invoice.due_date;
  const dueDate = dueRaw ? String(dueRaw).slice(0, 10) : "";
  const diffDays = dueRaw ? calendarDaysFromDue(dueRaw, now) : null;

  if (diffDays != null) {
    for (const rule of normalized.reminder_rules) {
      const days = Number(rule.days);
      if (!Number.isFinite(days)) continue;
      const match =
        rule.type === "before" ? diffDays === -days : diffDays === days;
      if (!match) continue;
      const eventType = dueEventTypeForRule(rule);
      actions.push({
        kind: "observe",
        eventType,
        reminderType: rule.id,
        days,
        dueDate,
        rule,
      });
      const alreadyReminded = (events || []).some(
        (event) =>
          String(event?.event_type || "") === DOCUMENT_EVENT_TYPE.reminded &&
          String(event?.payload?.reminder_type || "") === String(rule.id)
      );
      if (normalized.reminders_enabled && normalized.auto_send && !alreadyReminded) {
        actions.push({
          kind: "remind",
          eventType: DOCUMENT_EVENT_TYPE.reminded,
          reminderType: rule.id,
          days,
          dueDate,
          rule,
        });
      }
    }
  }

  const opened = firstEventOfType(events, DOCUMENT_EVENT_TYPE.opened);
  if (opened && normalized.viewed_not_paid.enabled) {
    const waitMs = normalized.viewed_not_paid.wait_hours * 60 * 60 * 1000;
    if (now.getTime() - opened.at.getTime() >= waitMs) {
      if (!hasEventType(events, DOCUMENT_EVENT_TYPE.viewed_not_paid)) {
        actions.push({
          kind: "observe",
          eventType: DOCUMENT_EVENT_TYPE.viewed_not_paid,
          reminderType: VIEWED_NOT_PAID_COPY.id,
          dueDate,
        });
      }
      const alreadyViewedReminded = (events || []).some(
        (event) =>
          String(event?.event_type || "") === DOCUMENT_EVENT_TYPE.reminded &&
          String(event?.payload?.reminder_type || "") === VIEWED_NOT_PAID_COPY.id
      );
      if (normalized.auto_send && normalized.reminders_enabled && !alreadyViewedReminded) {
        actions.push({
          kind: "remind",
          eventType: DOCUMENT_EVENT_TYPE.reminded,
          reminderType: VIEWED_NOT_PAID_COPY.id,
          dueDate,
          rule: VIEWED_NOT_PAID_COPY,
        });
      }
    }
  }

  return actions;
}

export function applyReminderTemplate(template, vars) {
  let out = String(template || "");
  for (const [key, value] of Object.entries(vars || {})) {
    out = out.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), String(value ?? ""));
  }
  return out;
}
