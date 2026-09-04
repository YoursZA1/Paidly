-- Workforce Core: memberships remain the employee identity.
-- Additive only. Does not create a parallel employees table.

DO $$
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION 'public.organizations does not exist.';
  END IF;
END $$;

ALTER TABLE public.memberships
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS employee_number text,
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS employment_start_date date,
  ADD COLUMN IF NOT EXISTS employment_end_date date,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS manager_membership_id uuid,
  ADD COLUMN IF NOT EXISTS invited_email text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_manager_membership_id_fkey'
  ) THEN
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_manager_membership_id_fkey
      FOREIGN KEY (manager_membership_id)
      REFERENCES public.memberships(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_employee_number_uidx
  ON public.memberships (org_id, employee_number)
  WHERE employee_number IS NOT NULL AND length(trim(employee_number)) > 0;

CREATE INDEX IF NOT EXISTS idx_memberships_org_invited_email
  ON public.memberships (org_id, invited_email)
  WHERE invited_email IS NOT NULL;

COMMENT ON COLUMN public.memberships.user_id IS
  'Auth identity. Null until the employee accepts a portal invite.';

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS membership_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_invites_membership
  ON public.company_invites (membership_id)
  WHERE membership_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.workforce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (org_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_workforce_events_pending
  ON public.workforce_events (created_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS public.workforce_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  event_id uuid REFERENCES public.workforce_events(id) ON DELETE SET NULL,
  correlation_id uuid,
  ip text,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workforce_audit_org
  ON public.workforce_audit_logs (org_id, created_at DESC);

-- Backfill HR master fields from payroll_profiles (do not delete source columns).
UPDATE public.memberships m
SET
  employee_number = COALESCE(m.employee_number, p.employee_number),
  department = COALESCE(NULLIF(trim(m.department), ''), p.department),
  employment_status = CASE
    WHEN m.employment_status IS NULL OR m.employment_status = 'active'
      THEN COALESCE(NULLIF(p.employment_status, ''), m.employment_status, 'active')
    ELSE m.employment_status
  END,
  employment_start_date = COALESCE(m.employment_start_date, p.employment_start_date)
FROM public.payroll_profiles p
WHERE p.membership_id = m.id;

-- memberships.user_id can be an orphan (no auth.users row). Do not fail the
-- backfill — store the profile and drop the invalid user link.
INSERT INTO public.payroll_profiles (
  org_id, membership_id, user_id, employee_number, employment_status, payroll_status
)
SELECT
  m.org_id,
  m.id,
  u.id,
  COALESCE(m.employee_number, 'EMP-' || substr(replace(m.id::text, '-', ''), 1, 8)),
  COALESCE(m.employment_status, 'active'),
  'active'
FROM public.memberships m
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_profiles p WHERE p.membership_id = m.id
);

INSERT INTO public.leave_balances (
  org_id, payroll_profile_id, leave_type_id, leave_year, entitled, accrued, used, pending
)
SELECT
  p.org_id,
  p.id,
  t.id,
  EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Johannesburg'))::integer,
  COALESCE(t.days_per_year, 0),
  0,
  0,
  0
FROM public.payroll_profiles p
JOIN public.leave_types t
  ON t.org_id = p.org_id
 AND t.active IS DISTINCT FROM false
WHERE NOT EXISTS (
  SELECT 1
  FROM public.leave_balances b
  WHERE b.payroll_profile_id = p.id
    AND b.leave_type_id = t.id
    AND b.leave_year = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Africa/Johannesburg'))::integer
);

CREATE OR REPLACE FUNCTION public.emit_membership_created_workforce_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workforce_events (
    org_id, employee_id, event_type, idempotency_key, payload, status
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'employee.created',
    'membership:' || NEW.id::text || ':created',
    jsonb_build_object('source', 'membership_insert'),
    'pending'
  )
  ON CONFLICT (org_id, event_type, idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_workforce_created ON public.memberships;
CREATE TRIGGER memberships_workforce_created
  AFTER INSERT ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_membership_created_workforce_event();

ALTER TABLE public.workforce_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workforce_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.workforce_audit_logs FROM anon;
REVOKE UPDATE, DELETE, INSERT ON TABLE public.workforce_audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.workforce_audit_logs TO authenticated;

DROP POLICY IF EXISTS "workforce_audit_select" ON public.workforce_audit_logs;
CREATE POLICY "workforce_audit_select" ON public.workforce_audit_logs
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
  );

DROP POLICY IF EXISTS "memberships org directory" ON public.memberships;
CREATE POLICY "memberships org directory" ON public.memberships
  FOR SELECT USING (
    public.is_admin()
    OR public.is_company_admin_for_org(org_id)
    OR public.is_company_manager_for_org(org_id)
    OR memberships.user_id = (SELECT auth.uid())
  );
