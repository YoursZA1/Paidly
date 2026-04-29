-- Enforce canonical logo storage contract:
-- Store only filename/path tokens (e.g. logo-abc123.png), never full URLs or bucket-prefixed values.

CREATE OR REPLACE FUNCTION public.normalize_logo_path_filename_only(v text)
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

  -- Preserve preview URLs used in client-side flows.
  IF s LIKE 'blob:%' OR s LIKE 'data:%' THEN
    RETURN s;
  END IF;

  -- If a full URL was stored, keep only the part after known bucket markers.
  IF position('/paidly/' in s) > 0 THEN
    s := split_part(split_part(s, '/paidly/', 2), '?', 1);
  ELSIF position('/company-logos/' in s) > 0 THEN
    s := split_part(split_part(s, '/company-logos/', 2), '?', 1);
  END IF;

  -- Strip common legacy prefixes.
  s := regexp_replace(s, '^storage/v1/object/public/paidly/', '');
  s := regexp_replace(s, '^storage/v1/object/sign/paidly/', '');
  s := regexp_replace(s, '^public/paidly/', '');
  s := regexp_replace(s, '^sign/paidly/', '');
  s := regexp_replace(s, '^paidly/', '');
  s := regexp_replace(s, '^company-logos/', '');

  -- Remove URL/query/hash artifacts.
  s := split_part(split_part(s, '#', 1), '?', 1);

  IF s = '' THEN
    RETURN NULL;
  END IF;

  RETURN s;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profiles_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.logo_url := public.normalize_logo_path_filename_only(NEW.logo_url);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_organizations_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.logo_url := public.normalize_logo_path_filename_only(NEW.logo_url);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_companies_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.logo_url := public.normalize_logo_path_filename_only(NEW.logo_url);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_invoices_owner_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.owner_logo_url := public.normalize_logo_path_filename_only(NEW.owner_logo_url);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_quotes_owner_logo_url_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.owner_logo_url := public.normalize_logo_path_filename_only(NEW.owner_logo_url);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.profiles
    SET logo_url = public.normalize_logo_path_filename_only(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';

    DROP TRIGGER IF EXISTS trg_profiles_logo_url_normalize ON public.profiles;
    CREATE TRIGGER trg_profiles_logo_url_normalize
    BEFORE INSERT OR UPDATE OF logo_url ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_profiles_logo_url_trigger();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.organizations
    SET logo_url = public.normalize_logo_path_filename_only(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';

    DROP TRIGGER IF EXISTS trg_organizations_logo_url_normalize ON public.organizations;
    CREATE TRIGGER trg_organizations_logo_url_normalize
    BEFORE INSERT OR UPDATE OF logo_url ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_organizations_logo_url_trigger();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'logo_url'
  ) THEN
    UPDATE public.companies
    SET logo_url = public.normalize_logo_path_filename_only(logo_url)
    WHERE logo_url IS NOT NULL AND logo_url <> '';

    DROP TRIGGER IF EXISTS trg_companies_logo_url_normalize ON public.companies;
    CREATE TRIGGER trg_companies_logo_url_normalize
    BEFORE INSERT OR UPDATE OF logo_url ON public.companies
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_companies_logo_url_trigger();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.invoices
    SET owner_logo_url = public.normalize_logo_path_filename_only(owner_logo_url)
    WHERE owner_logo_url IS NOT NULL AND owner_logo_url <> '';

    DROP TRIGGER IF EXISTS trg_invoices_owner_logo_url_normalize ON public.invoices;
    CREATE TRIGGER trg_invoices_owner_logo_url_normalize
    BEFORE INSERT OR UPDATE OF owner_logo_url ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_invoices_owner_logo_url_trigger();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'owner_logo_url'
  ) THEN
    UPDATE public.quotes
    SET owner_logo_url = public.normalize_logo_path_filename_only(owner_logo_url)
    WHERE owner_logo_url IS NOT NULL AND owner_logo_url <> '';

    DROP TRIGGER IF EXISTS trg_quotes_owner_logo_url_normalize ON public.quotes;
    CREATE TRIGGER trg_quotes_owner_logo_url_normalize
    BEFORE INSERT OR UPDATE OF owner_logo_url ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_quotes_owner_logo_url_trigger();
  END IF;
END $$;

