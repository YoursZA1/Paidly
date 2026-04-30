import { useEffect } from 'react';
import PaymentReminderService from '@/components/reminders/PaymentReminderService';
import { useAuth } from '@/contexts/AuthContext';

const STORAGE_KEY = 'paidly_payment_reminder_last_run';

/**
 * Runs once per day per browser tab while the app is open (best-effort unpaid invoice reminders).
 * For server-side scheduling, see Vercel Cron + `/api/cron/payment-reminders` (docs/CRON_PAYMENT_REMINDERS.md).
 */
export default function PaymentReminderScheduler() {
  const { profile } = useAuth();
  useEffect(() => {
    const today = new Date().toDateString();
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === today) {
        return;
      }
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        await PaymentReminderService.checkAndSendReminders(profile || null);
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      try {
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(STORAGE_KEY, today);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  return null;
}
