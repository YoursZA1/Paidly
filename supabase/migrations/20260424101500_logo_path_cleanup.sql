-- One-time cleanup: convert legacy full logo URLs to storage paths.
-- Example:
--   https://.../storage/v1/object/public/company-logos/logo-abc.png
-- becomes:
--   logo-abc.png

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.profiles
    SET logo_url = split_part(split_part(logo_url, '/company-logos/', 2), '?', 1)
    WHERE logo_url ILIKE '%http%'
      AND position('/company-logos/' in logo_url) > 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.companies
    SET logo_url = split_part(split_part(logo_url, '/company-logos/', 2), '?', 1)
    WHERE logo_url ILIKE '%http%'
      AND position('/company-logos/' in logo_url) > 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.organizations
    SET logo_url = split_part(split_part(logo_url, '/company-logos/', 2), '?', 1)
    WHERE logo_url ILIKE '%http%'
      AND position('/company-logos/' in logo_url) > 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.invoices
    SET owner_logo_url = split_part(split_part(owner_logo_url, '/company-logos/', 2), '?', 1)
    WHERE owner_logo_url ILIKE '%http%'
      AND position('/company-logos/' in owner_logo_url) > 0;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.quotes
    SET owner_logo_url = split_part(split_part(owner_logo_url, '/company-logos/', 2), '?', 1)
    WHERE owner_logo_url ILIKE '%http%'
      AND position('/company-logos/' in owner_logo_url) > 0;
  END IF;
END $$;
