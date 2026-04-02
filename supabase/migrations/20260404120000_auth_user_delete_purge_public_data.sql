-- When auth.users is deleted (user self-service or admin), remove public rows that would otherwise
-- stay with ON DELETE SET NULL (subscriptions, affiliate applications) or retain PII (waitlist).
-- Org-owned business data: organizations.owner_id -> auth.users ON DELETE CASCADE already removes
-- the user's owned org(s) and all org_id FK CASCADE children (clients, invoices, quotes, etc.).

CREATE OR REPLACE FUNCTION public.purge_public_user_data_on_auth_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  em text;
BEGIN
  em := lower(trim(COALESCE(OLD.email, '')));

  -- Platform subscription rows (admin UI); user_id uses ON DELETE SET NULL — remove entirely
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    DELETE FROM public.subscriptions
    WHERE user_id = OLD.id
       OR (em <> '' AND lower(trim(email)) = em);
  END IF;

  -- Affiliate applications: ON DELETE SET NULL would keep name/email on the row
  IF to_regclass('public.affiliate_applications') IS NOT NULL THEN
    DELETE FROM public.affiliate_applications
    WHERE user_id = OLD.id
       OR (em <> '' AND lower(trim(email)) = em);
  END IF;

  -- Pre-signup waitlist entry for the same email (optional PII cleanup)
  IF to_regclass('public.waitlist_signups') IS NOT NULL AND em <> '' THEN
    DELETE FROM public.waitlist_signups WHERE lower(trim(email)) = em;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS purge_public_user_data_before_auth_delete ON auth.users;

CREATE TRIGGER purge_public_user_data_before_auth_delete
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.purge_public_user_data_on_auth_delete();

COMMENT ON FUNCTION public.purge_public_user_data_on_auth_delete() IS
  'Removes subscriptions, affiliate applications, and waitlist rows tied to the auth user before the user row is deleted.';
