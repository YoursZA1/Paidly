/**
 * Email Notification Service
 * Client-side outbox used to simulate email delivery in the UI.
 */

import SystemSettingsService from '@/services/SystemSettingsService';

const STORAGE_KEY = 'breakapi_email_outbox';
const MAX_ENTRIES = 5000;

const loadOutbox = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load email outbox:', error);
    return [];
  }
};

const saveOutbox = (entries) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to save email outbox:', error);
  }
};

export const EmailNotificationService = {
  /**
   * Send an email (simulated).
   */
  sendEmail({
    to,
    subject,
    body,
    metadata = {},
    from = null
  }) {
    try {
      const notifications = SystemSettingsService.getSection('notifications');
      if (!notifications?.emailNotificationsEnabled) {
        return { success: false, message: 'Email notifications disabled' };
      }

      const outbox = loadOutbox();
      const settings = SystemSettingsService.getSection('system');
      const sender = from || settings?.supportEmail || settings?.adminEmail || 'no-reply@invoicebreek.com';

      const entry = {
        id: `email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        to,
        from: sender,
        subject,
        body,
        metadata,
        status: 'queued',
        created_at: new Date().toISOString()
      };

      outbox.unshift(entry);
      if (outbox.length > MAX_ENTRIES) {
        outbox.length = MAX_ENTRIES;
      }
      saveOutbox(outbox);

      return { success: true, entry };
    } catch (error) {
      console.error('Failed to send email:', error);
      return { success: false, error, message: 'Failed to send email' };
    }
  }
};

export default EmailNotificationService;
