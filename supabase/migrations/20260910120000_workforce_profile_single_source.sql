-- Employee Profile is the HR source of truth (memberships).
-- payroll_profiles mirrors HR columns; compensation remains on payroll_profiles.
-- Additive only. Does not delete rows.

DO $$
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
  IF to_regclass('public.payroll_profiles') IS NULL THEN
    RAISE EXCEPTION 'public.payroll_profiles does not exist.';
  END IF;
END $$;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS invited_name text;

UPDATE public.memberships m
SET job_title = COALESCE(
  NULLIF(trim(m.job_title), ''),
  (
    SELECT NULLIF(trim(p.job_title), '')
    FROM public.payroll_profiles p
    WHERE p.membership_id = m.id
    LIMIT 1
  ),
  (
    SELECT NULLIF(trim(pr.job_title), '')
    FROM public.profiles pr
    WHERE pr.id = m.user_id
    LIMIT 1
  )
)
WHERE m.job_title IS NULL OR length(trim(m.job_title)) = 0;

UPDATE public.memberships m
SET invited_name = COALESCE(
  NULLIF(trim(m.invited_name), ''),
  (
    SELECT NULLIF(trim(i.invited_name), '')
    FROM public.company_invites i
    WHERE i.membership_id = m.id
    ORDER BY i.created_at DESC NULLS LAST
    LIMIT 1
  ),
  (
    SELECT NULLIF(trim(p.full_name), '')
    FROM public.payroll_profiles p
    WHERE p.membership_id = m.id
    LIMIT 1
  )
)
WHERE m.invited_name IS NULL OR length(trim(m.invited_name)) = 0;

UPDATE public.payroll_profiles p
SET
  employee_number = COALESCE(NULLIF(trim(src.employee_number), ''), p.employee_number),
  department = COALESCE(NULLIF(trim(src.department), ''), p.department),
  employment_status = COALESCE(NULLIF(trim(src.employment_status), ''), p.employment_status, 'active'),
  employment_start_date = COALESCE(src.employment_start_date, p.employment_start_date),
  job_title = COALESCE(NULLIF(trim(src.job_title), ''), p.job_title),
  email = COALESCE(NULLIF(trim(src.profile_email), ''), NULLIF(trim(src.invited_email), ''), p.email),
  full_name = COALESCE(NULLIF(trim(src.profile_full_name), ''), NULLIF(trim(src.invited_name), ''), p.full_name)
FROM (
  SELECT
    m.id AS membership_id,
    m.employee_number,
    m.department,
    m.employment_status,
    m.employment_start_date,
    m.job_title,
    m.invited_email,
    m.invited_name,
    pr.email AS profile_email,
    pr.full_name AS profile_full_name
  FROM public.memberships m
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
) src
WHERE p.membership_id = src.membership_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memberships_manager_not_self'
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_manager_not_self
      CHECK (manager_membership_id IS DISTINCT FROM id) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.memberships VALIDATE CONSTRAINT memberships_manager_not_self;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'memberships_manager_not_self left NOT VALID: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.sync_payroll_profile_hr_mirror()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mem public.memberships%ROWTYPE;
  person public.profiles%ROWTYPE;
BEGIN
  IF NEW.membership_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO mem FROM public.memberships WHERE id = NEW.membership_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  IF mem.user_id IS NOT NULL THEN
    SELECT * INTO person FROM public.profiles WHERE id = mem.user_id;
  END IF;
  NEW.employee_number := COALESCE(NULLIF(trim(mem.employee_number), ''), NEW.employee_number);
  NEW.department := COALESCE(NULLIF(trim(mem.department), ''), NEW.department);
  NEW.employment_status := COALESCE(NULLIF(trim(mem.employment_status), ''), NEW.employment_status, 'active');
  NEW.employment_start_date := COALESCE(mem.employment_start_date, NEW.employment_start_date);
  NEW.job_title := COALESCE(NULLIF(trim(mem.job_title), ''), NEW.job_title);
  NEW.email := COALESCE(NULLIF(trim(person.email), ''), NULLIF(trim(mem.invited_email), ''), NEW.email);
  NEW.full_name := COALESCE(
    NULLIF(trim(person.full_name), ''),
    NULLIF(trim(mem.invited_name), ''),
    NEW.full_name
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payroll_profiles_hr_mirror ON public.payroll_profiles;
CREATE TRIGGER payroll_profiles_hr_mirror
  BEFORE INSERT OR UPDATE ON public.payroll_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_payroll_profile_hr_mirror();

COMMENT ON FUNCTION public.sync_payroll_profile_hr_mirror() IS
  'payroll_profiles mirrors HR columns from memberships. Write HR to memberships.';
