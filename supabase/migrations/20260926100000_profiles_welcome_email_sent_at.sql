-- Paidly welcome email: sent once, after email verification (2026-09-26).
--
-- profiles.welcome_email_sent_at is the idempotency record. POST /api/auth/welcome claims it with
--   UPDATE profiles SET welcome_email_sent_at = now() WHERE id = <token user> AND welcome_email_sent_at IS NULL
-- and only the request that wins the claim sends the email (server/src/auth/authWelcomeEmailApi.js).
--
-- 1. Column.
-- 2. Backfill: every profile whose auth user is ALREADY verified is marked as welcomed, so people
--    who use Paidly today never get a welcome email when this ships. Unverified sign-ups stay NULL and
--    are welcomed once they verify.
-- 3. Guard: end users (authenticated / anon JWTs via PostgREST) cannot set or clear the column —
--    otherwise a user could reset it and trigger the welcome email again. The server (service_role)
--    is not affected. Other profile updates are untouched.
--
-- Idempotent. Roll back: DROP TRIGGER profiles_welcome_email_guard ON public.profiles;
--   DROP FUNCTION public.profiles_guard_welcome_email_sent_at(); ALTER TABLE public.profiles DROP COLUMN welcome_email_sent_at;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;

COMMENT ON COLUMN public.profiles.welcome_email_sent_at IS
  'When the Paidly welcome email was sent (once, after email verification). Written by the server only.';

UPDATE public.profiles p
SET welcome_email_sent_at = COALESCE(u.email_confirmed_at, now())
FROM auth.users u
WHERE u.id = p.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.welcome_email_sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.profiles_guard_welcome_email_sent_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Server writers (service_role, signup trigger) run without an end-user JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.welcome_email_sent_at := NULL;
  ELSE
    NEW.welcome_email_sent_at := OLD.welcome_email_sent_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_welcome_email_sent_at() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_welcome_email_guard ON public.profiles;
CREATE TRIGGER profiles_welcome_email_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_welcome_email_sent_at();
