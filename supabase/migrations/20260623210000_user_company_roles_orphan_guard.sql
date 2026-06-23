-- Repair: user_company_roles backfill and upsert must skip orphaned membership user_ids
-- (memberships.user_id with no matching auth.users row). Without this guard, applying
-- 20260612120000_user_company_onboarding_roles.sql fails with:
--   user_company_roles_user_id_fkey ... Key (user_id)=... is not present in table "users"

CREATE OR REPLACE FUNCTION public.upsert_user_company_role(
  p_user_id uuid,
  p_org_id uuid,
  p_company_role text,
  p_onboarding_form text,
  p_assigned_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned_by uuid := p_assigned_by;
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RETURN;
  END IF;

  IF v_assigned_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_assigned_by) THEN
    v_assigned_by := NULL;
  END IF;

  INSERT INTO public.user_company_roles (user_id, org_id, company_role, onboarding_form, assigned_by)
  VALUES (
    p_user_id,
    p_org_id,
    lower(trim(coalesce(p_company_role, 'employee'))),
    CASE WHEN lower(trim(coalesce(p_onboarding_form, 'member'))) = 'admin' THEN 'admin' ELSE 'member' END,
    v_assigned_by
  )
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    company_role = EXCLUDED.company_role,
    onboarding_form = EXCLUDED.onboarding_form,
    assigned_by = COALESCE(EXCLUDED.assigned_by, user_company_roles.assigned_by),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_company_role(uuid, uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_user_company_role(uuid, uuid, text, text, uuid) TO service_role;

-- Idempotent backfill for environments where the original INSERT failed partway through.
INSERT INTO public.user_company_roles (user_id, org_id, company_role, onboarding_form, assigned_by)
SELECT
  m.user_id,
  m.org_id,
  m.role,
  CASE
    WHEN o.owner_id = m.user_id OR m.role = 'owner' THEN 'admin'
    ELSE 'member'
  END,
  NULL
FROM public.memberships m
INNER JOIN auth.users u ON u.id = m.user_id
LEFT JOIN public.organizations o ON o.id = m.org_id
ON CONFLICT (user_id, org_id) DO NOTHING;
