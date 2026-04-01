-- Align subscriptions table with admin UI / paidly client (user link + billing start).
-- Safe to run on existing projects: IF NOT EXISTS.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS start_date timestamptz;

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.user_id IS 'Links subscription row to auth user (admin Subscriptions UI).';
COMMENT ON COLUMN public.subscriptions.start_date IS 'Subscription / billing period start (admin UI).';
