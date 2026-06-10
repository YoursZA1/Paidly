-- Company team invites: join existing org from invite metadata + admin membership management.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  v_staff_role text;
  v_company_org_id uuid;
  v_company_role text;
BEGIN
  v_staff_role := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', '')));
  IF v_staff_role IS NULL OR v_staff_role = '' OR v_staff_role NOT IN ('admin', 'management', 'sales', 'support') THEN
    v_staff_role := NULL;
  END IF;

  BEGIN
    v_company_org_id := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'company_org_id', '')), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_company_org_id := NULL;
  END;
  v_company_role := public.normalize_company_role(COALESCE(NEW.raw_user_meta_data->>'company_role', 'employee'));

  BEGIN
    INSERT INTO public.profiles (
      id, email, full_name, avatar_url, logo_url, company_name, company_address, phone,
      subscription_plan, currency, timezone, role
    )
    VALUES (
      NEW.id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'logo_url',
      NEW.raw_user_meta_data->>'company_name',
      NEW.raw_user_meta_data->>'company_address',
      NEW.raw_user_meta_data->>'phone',
      COALESCE(NEW.raw_user_meta_data->>'plan', NEW.raw_user_meta_data->>'subscription_plan', 'starter'),
      COALESCE(NEW.raw_user_meta_data->>'currency', 'USD'),
      COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
      v_staff_role
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      avatar_url = EXCLUDED.avatar_url,
      logo_url = COALESCE(EXCLUDED.logo_url, profiles.logo_url),
      company_name = COALESCE(EXCLUDED.company_name, profiles.company_name),
      company_address = COALESCE(EXCLUDED.company_address, profiles.company_address),
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      subscription_plan = COALESCE(EXCLUDED.subscription_plan, profiles.subscription_plan),
      currency = COALESCE(EXCLUDED.currency, profiles.currency),
      timezone = COALESCE(EXCLUDED.timezone, profiles.timezone),
      role = COALESCE(EXCLUDED.role, profiles.role),
      updated_at = now();
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Profile creation failed for user %: %', NEW.id, SQLERRM;
  END;

  IF v_company_org_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.memberships (org_id, user_id, role)
      VALUES (v_company_org_id, NEW.id, v_company_role)
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Company membership join failed for user %: %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.organizations (name, owner_id)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'org_name', 'My Organization'), NEW.id)
    RETURNING id INTO new_org_id;

    INSERT INTO public.memberships (org_id, user_id, role)
    VALUES (new_org_id, NEW.id, 'owner');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Org/Membership creation failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "company_admins_insert_memberships" ON public.memberships;
CREATE POLICY "company_admins_insert_memberships"
  ON public.memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_admin_for_org(org_id)
    AND user_id <> auth.uid()
  );

DROP POLICY IF EXISTS "company_admins_update_memberships" ON public.memberships;
CREATE POLICY "company_admins_update_memberships"
  ON public.memberships
  FOR UPDATE
  TO authenticated
  USING (public.is_company_admin_for_org(org_id))
  WITH CHECK (public.is_company_admin_for_org(org_id));
