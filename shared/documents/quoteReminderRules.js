import { QUOTE_STATUS, normalizeQuoteStatus } from "../commercial/documentStatuses.js";
import { DOCUMENT_EVENT_TYPE, firstEventOfType, hasEventType } from "./documentEvents.js";

export const DEFAULT_QUOTE_FOLLOW_UP = Object.freeze({
  enabled: false,
  days_after_sent: 3,
  auto_send: true,
  subject: "Following up on quote {{quote_number}}",
  body: "Just following up on your quote. Please let us know if you'd like to proceed.",
});

const CLOSED = new Set([
  QUOTE_STATUS.accepted,
  QUOTE_STATUS.declined,
  QUOTE_STATUS.expired,
  QUOTE_STATUS.converted,
  QUOTE_STATUS.draft,
]);

export function normalizeQuoteFollowUpSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const days = Number(source.days_after_sent);
  return {
    enabled: source.enabled === true,
    auto_send: source.auto_send !== false,
    days_after_sent: Number.isFinite(days) && days >= 1 ? Math.min(365, Math.floor(days)) : 3,
    subject: source.subject || DEFAULT_QUOTE_FOLLOW_UP.subject,
    body: source.body || DEFAULT_QUOTE_FOLLOW_UP.body,
  };
}

export function quoteIsFollowUpable(quote) {
  const status = normalizeQuoteStatus(quote?.status);
  return Boolean(quote?.id) && !CLOSED.has(status);
}

export function evaluateQuoteFollowUpActions({
  quote,
  events = [],
  settings,
  now = new Date(),
} = {}) {
  const normalized = normalizeQuoteFollowUpSettings(settings);
  if (!normalized.enabled || !quoteIsFollowUpable(quote)) return [];

  const sent = firstEventOfType(events, DOCUMENT_EVENT_TYPE.sent);
  const sentAt = sent?.at || (quote.sent_date ? new Date(quote.sent_date) : quote.updated_at ? new Date(quote.updated_at) : null);
  if (!sentAt || Number.isNaN(sentAt.getTime())) return [];

  const waitMs = normalized.days_after_sent * 86400000;
  if (now.getTime() - sentAt.getTime() < waitMs) return [];
  if (hasEventType(events, DOCUMENT_EVENT_TYPE.reminded)) return [];

  return [
    {
      kind: "remind",
      eventType: DOCUMENT_EVENT_TYPE.reminded,
      reminderType: `followup_${normalized.days_after_sent}_days`,
      rule: {
        id: `followup_${normalized.days_after_sent}_days`,
        subject: normalized.subject,
        body: normalized.body,
      },
    },
  ];
}

export function quoteShouldExpire(quote, now = new Date()) {
  const status = normalizeQuoteStatus(quote?.status);
  if (status !== QUOTE_STATUS.sent && status !== QUOTE_STATUS.viewed) return false;
  const raw = quote.valid_until || quote.due_date;
  if (!raw) return false;
  const expiry = new Date(raw);
  if (Number.isNaN(expiry.getTime())) return false;
  expiry.setHours(23, 59, 59, 999);
  return now.getTime() > expiry.getTime();
}
