-- One-time cleanup: normalize stored logo values to filename-only.
-- Handles:
-- - Full URLs (.../storage/v1/object/public/paidly/logo-abc.png)
-- - Full URLs (.../storage/v1/object/public/company-logos/logo-abc.png)
-- - Prefixed values (paidly/logo-abc.png)

CREATE OR REPLACE FUNCTION public.normalize_logo_path(v text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  s text;
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN
    RETURN NULL;
  END IF;

  s := btrim(v);

  IF position('/paidly/' in s) > 0 THEN
    s := split_part(split_part(s, '/paidly/', 2), '?', 1);
  ELSIF position('/company-logos/' in s) > 0 THEN
    s := split_part(split_part(s, '/company-logos/', 2), '?', 1);
  END IF;

  s := regexp_replace(s, '^paidly/', '');
  s := regexp_replace(s, '^company-logos/', '');
  s := split_part(split_part(s, '#', 1), '?', 1);

  IF s = '' THEN
    RETURN NULL;
  END IF;

  RETURN s;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.profiles
    SET logo_url = public.normalize_logo_path(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.organizations
    SET logo_url = public.normalize_logo_path(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.companies
    SET logo_url = public.normalize_logo_path(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.invoices
    SET owner_logo_url = public.normalize_logo_path(owner_logo_url)
    WHERE owner_logo_url IS NOT NULL AND owner_logo_url <> '';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.quotes
    SET owner_logo_url = public.normalize_logo_path(owner_logo_url)
    WHERE owner_logo_url IS NOT NULL AND owner_logo_url <> '';
  END IF;
END $$;
