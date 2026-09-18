-- People Calendar needs DOB on the employee membership (HR source of truth).
-- Organogram continues to use manager_membership_id — no second hierarchy table.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMENT ON COLUMN public.memberships.date_of_birth IS
  'Employee date of birth for People Calendar birthdays. Optional; age shown only when set.';

CREATE INDEX IF NOT EXISTS idx_memberships_org_dob
  ON public.memberships (org_id, date_of_birth)
  WHERE date_of_birth IS NOT NULL;
