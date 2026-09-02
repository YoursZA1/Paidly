-- Optional POS-specific logo. Independent of profiles.logo_url (business / documents).
-- POS resolves: pos_logo_url || logo_url. Invoices and quotes never read this column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pos_logo_url text;

COMMENT ON COLUMN public.profiles.pos_logo_url IS
  'Optional POS/till logo. Documents use logo_url only. POS falls back to logo_url when this is null.';

CREATE OR REPLACE FUNCTION public.normalize_profiles_pos_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.pos_logo_url := public.normalize_logo_path_filename_only(NEW.pos_logo_url);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_pos_logo_url_normalize ON public.profiles;
CREATE TRIGGER trg_profiles_pos_logo_url_normalize
BEFORE INSERT OR UPDATE OF pos_logo_url ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profiles_pos_logo_url_trigger();
