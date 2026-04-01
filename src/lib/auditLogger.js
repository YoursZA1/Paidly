/** Client-side audit trail stub — persists last N entries to localStorage for admin review in dev. */

const STORAGE_KEY = 'paidly_audit_log';
const MAX_ENTRIES = 200;

export const AUDIT_ACTIONS = {
  SETTINGS_UPDATED: 'settings_updated',
  SUBSCRIPTION_STATUS_CHANGED: 'subscription_status_changed',
  USER_STATUS_CHANGED: 'user_status_changed',
  AFFILIATE_APPROVED: 'affiliate_approved',
  AFFILIATE_DECLINED: 'affiliate_declined',
};

/**
 * @param {{ actor?: object, action: string, category?: string, description?: string, after?: object, before?: object, targetId?: string, targetLabel?: string }} payload
 */
export function logAction({ actor, action, category, description, after, before, targetId, targetLabel }) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    category,
    description,
    actorId: actor?.id,
    actorEmail: actor?.email,
    after,
    before,
    targetId,
    targetLabel,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
    }
  } catch {
    /* ignore */
  }
  if (import.meta.env?.DEV) {
    console.debug('[audit]', entry);
  }
}
