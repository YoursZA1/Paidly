-- Retired: profiles.pos_logo_url was never used by Settings or POS UI.
-- POS, invoices, and profile chrome use profiles.logo_url (Business Logo).
-- Safe if 20260902180000 was already applied; no-op if the column was never created.

DROP TRIGGER IF EXISTS trg_profiles_pos_logo_url_normalize ON public.profiles;
DROP FUNCTION IF EXISTS public.normalize_profiles_pos_logo_url_trigger();

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS pos_logo_url;
