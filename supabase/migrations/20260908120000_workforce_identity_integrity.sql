-- Tighten workforce FKs and unique constraints. Additive only.
-- Does not delete rows. Does not weaken UUID columns to text.
-- Canonical employee UUID remains public.memberships.id.

DO $$
BEGIN
  IF to_regclass('public.memberships') IS NULL THEN
    RAISE EXCEPTION 'public.memberships does not exist.';
  END IF;
END $$;

-- Drop invalid pay-run membership pointers before adding the FK.
UPDATE public.pay_run_items i
SET membership_id = NULL
WHERE i.membership_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.id = i.membership_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pay_run_items_membership_id_fkey'
      AND conrelid = 'public.pay_run_items'::regclass
  ) THEN
    ALTER TABLE public.pay_run_items
      ADD CONSTRAINT pay_run_items_membership_id_fkey
      FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE SET NULL;
  END IF;
END $$;

-- One issued payslip per processed payroll entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslips_pay_run_item
  ON public.payslips (pay_run_item_id)
  WHERE pay_run_item_id IS NOT NULL;

-- Finish backfill of leave.employee_id from the derived payroll profile.
UPDATE public.leave_balances b
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE b.payroll_profile_id = p.id
  AND b.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

UPDATE public.leave_requests r
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE r.payroll_profile_id = p.id
  AND r.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

UPDATE public.leave_transactions t
SET employee_id = p.membership_id
FROM public.payroll_profiles p
WHERE t.payroll_profile_id = p.id
  AND t.employee_id IS NULL
  AND p.membership_id IS NOT NULL;

COMMENT ON CONSTRAINT pay_run_items_membership_id_fkey ON public.pay_run_items IS
  'Payroll entries reference the canonical employee (memberships.id).';

CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_user_id_uidx
  ON public.memberships (org_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.emit_membership_portal_activated_workforce_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL
     AND (OLD.user_id IS NULL OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    INSERT INTO public.workforce_events (
      org_id, employee_id, event_type, idempotency_key, payload, status
    ) VALUES (
      NEW.org_id,
      NEW.id,
      'employee.portal.activated',
      'membership:' || NEW.id::text || ':portal_activated',
      jsonb_build_object('source', 'membership_user_link'),
      'pending'
    )
    ON CONFLICT (org_id, event_type, idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_workforce_portal_activated ON public.memberships;
CREATE TRIGGER memberships_workforce_portal_activated
  AFTER UPDATE OF user_id ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.emit_membership_portal_activated_workforce_event();

-- Link a pre-created workforce membership (nullable user_id) when the invite is accepted.
CREATE OR REPLACE FUNCTION public.accept_company_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_meta jsonb;
  v_invite_id uuid;
  v_org_id uuid;
  v_role text;
  v_membership_role text;
  v_job_function text;
  v_email text;
  v_onboarding_form text;
  v_register_id uuid;
  v_pending_membership_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_meta := public.validate_company_invite_token(p_token);
  IF (v_meta->>'ok')::boolean IS NOT TRUE THEN
    RETURN v_meta;
  END IF;

  v_invite_id := (v_meta->>'invite_id')::uuid;
  v_org_id := (v_meta->>'org_id')::uuid;
  v_role := lower(trim(v_meta->>'role'));
  v_job_function := public.normalize_job_function(
    COALESCE(v_meta->>'job_function', 'general')
  );
  IF lower(trim(coalesce(v_meta->>'source', ''))) = 'pos' THEN
    v_job_function := 'pos';
  END IF;
  BEGIN
    v_register_id := NULLIF(v_meta->>'register_id', '')::uuid;
  EXCEPTION
    WHEN others THEN
      v_register_id := NULL;
  END;

  SELECT lower(trim(email)) INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL OR v_email <> lower(trim(v_meta->>'email')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_membership_role := CASE
    WHEN v_role IN ('admin', 'owner', 'company_admin') THEN 'admin'
    WHEN v_role = 'manager' THEN 'manager'
    ELSE 'employee'
  END;

  IF v_job_function = 'pos' THEN
    v_membership_role := 'employee';
  END IF;

  v_onboarding_form := CASE
    WHEN v_membership_role IN ('admin', 'owner') THEN 'admin'
    ELSE 'member'
  END;

  SELECT ci.membership_id INTO v_pending_membership_id
  FROM public.company_invites ci
  WHERE ci.id = v_invite_id;

  IF v_job_function = 'pos' THEN
    v_pending_membership_id := NULL;
  END IF;

  IF v_pending_membership_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = v_pending_membership_id AND m.org_id = v_org_id
  ) THEN
    UPDATE public.memberships
    SET user_id = v_user_id,
        role = v_membership_role,
        job_function = v_job_function,
        pos_register_id = CASE
          WHEN v_job_function = 'pos' THEN COALESCE(v_register_id, pos_register_id)
          ELSE pos_register_id
        END
    WHERE id = v_pending_membership_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = v_org_id AND m.user_id = v_user_id
  ) THEN
    UPDATE public.memberships
    SET role = v_membership_role,
        job_function = v_job_function,
        pos_register_id = CASE
          WHEN v_job_function = 'pos' THEN COALESCE(v_register_id, pos_register_id)
          ELSE pos_register_id
        END
    WHERE org_id = v_org_id AND user_id = v_user_id;
  ELSE
    INSERT INTO public.memberships (org_id, user_id, role, job_function, pos_register_id)
    VALUES (
      v_org_id,
      v_user_id,
      v_membership_role,
      v_job_function,
      CASE WHEN v_job_function = 'pos' THEN v_register_id ELSE NULL END
    );
  END IF;

  IF coalesce((v_meta->>'transfer_org_ownership')::boolean, false) THEN
    UPDATE public.organizations SET owner_id = v_user_id WHERE id = v_org_id;
    UPDATE public.memberships
    SET role = 'owner', job_function = 'general', pos_register_id = NULL
    WHERE org_id = v_org_id AND user_id = v_user_id;
    v_onboarding_form := 'admin';
    v_membership_role := 'owner';
    v_job_function := 'general';
  END IF;

  PERFORM public.upsert_user_company_role(
    v_user_id, v_org_id, public.normalize_company_role(v_membership_role), v_onboarding_form, NULL
  );
  PERFORM public.sync_saas_user_roles(v_user_id);

  IF v_job_function = 'pos' AND v_register_id IS NOT NULL AND to_regclass('public.pos_registers') IS NOT NULL THEN
    UPDATE public.pos_registers
    SET assigned_staff_id = v_user_id
    WHERE id = v_register_id
      AND org_id = v_org_id;
  END IF;

  UPDATE public.company_invites
  SET status = 'accepted', accepted_at = now(), accepted_by = v_user_id
  WHERE id = v_invite_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_org_id,
    'role', v_membership_role,
    'job_function', v_job_function,
    'register_id', v_register_id,
    'scope', CASE WHEN v_job_function = 'pos' THEN 'pos' ELSE 'paidly' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_company_invite_token(text) TO authenticated;
