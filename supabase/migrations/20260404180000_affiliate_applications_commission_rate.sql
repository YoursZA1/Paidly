-- Optional mirror of partner commission % on the application row (admin UI edits).
-- Canonical rate for ledger math remains public.affiliates.commission_rate (0–1).

ALTER TABLE public.affiliate_applications
  ADD COLUMN IF NOT EXISTS commission_rate numeric;

COMMENT ON COLUMN public.affiliate_applications.commission_rate IS
  'Agreed commission as percent (e.g. 20) or fraction (e.g. 0.2); optional; synced from affiliates on approve.';
