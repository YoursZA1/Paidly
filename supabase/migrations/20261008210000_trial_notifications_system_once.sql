-- One automatic send per subscription, type, and trial end. An admin's manual send is logged
-- with source = 'admin' and no longer occupies that slot, so a manual "Send subscription prompt"
-- before expiry does not stop the automatic expiry email, and an admin can resend on purpose.
-- Idempotent.

DROP INDEX IF EXISTS public.subscription_notifications_sent_once;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_notifications_system_sent_once
  ON public.subscription_notifications (subscription_id, notification_type, trial_ends_at)
  WHERE status = 'sent' AND source = 'system';

COMMENT ON TABLE public.subscription_notifications IS
  'Trial and subscription emails. status=sent with source=system is idempotent per subscription, type, and trial_ends_at. status=failed may be retried. source=admin rows are manual sends and do not count toward the automatic once-only rule.';
