-- New profile inserts default to the current catalog (Starter), not Individual.
-- Existing Individual / SME / Corporate rows are left unchanged for audit and migration.

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'starter';

ALTER TABLE public.profiles
  ALTER COLUMN subscription_plan SET DEFAULT 'starter';
