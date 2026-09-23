-- Package identity is the subscription's package — never inferred from trial/free status (2026-09-23).
--
-- Fixes three ways a company resolved to the wrong package (usually "Starter" or "none"):
--
-- 1. plan_family drift. The resolver (server/src/billing/entitlements.js) and this mirror read
--    plan_family first until now (both now read plan_slug first, plan_family as fallback). PayFast ITN updates wrote plan/plan_slug only, so a trial row that
--    received a Business payment kept plan_family = 'starter'. Since 20260921140000 replaced the old
--    BEFORE trigger, nothing re-derived it. subscriptions_derive_plan_family() now keeps plan_family
--    in step with the package columns whenever a writer changes them without setting it.
-- 2. 'trial' / 'free' / 'none' meant Starter in normalize_plan_family. They are statuses, not
--    packages: they now resolve to NULL (no package), matching shared/plans.js familyForSlug.
-- 3. Owner rows without company_id were invisible once the company was resolved. They now count
--    for that company, matching server/src/billing/entitlements.js loadCompanySubscriptionRows.
--
-- Data is not rewritten here. Existing drifted rows: supabase/scripts/plan_reconciliation_report.sql
-- (section "plan_family drift") and plan_reconciliation_apply.sql.

CREATE OR REPLACE FUNCTION public.normalize_plan_family(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN v IN ('starter', 'business', 'growth', 'enterprise') THEN v
    WHEN v IN ('individual', 'basic', 'starter_monthly', 'starter_annual') THEN 'starter'
    WHEN v IN ('sme', 'professional', 'pro', 'business_monthly', 'business_annual') THEN 'business'
    WHEN v IN ('corporate', 'growth_monthly', 'growth_annual') THEN 'growth'
    WHEN v IN ('enterprise_custom') THEN 'enterprise'
    ELSE NULL  -- includes 'trial', 'free', 'none': a status, not a package
  END
  FROM (SELECT lower(trim(coalesce(p_raw, ''))) AS v) s;
$$;

COMMENT ON FUNCTION public.normalize_plan_family(text) IS
  'Plan slug/alias → family (starter|business|growth|enterprise) or NULL. trial/free/none are NULL. Mirrors shared/plans.js familyForSlug.';

-- ── 1. plan_family follows the package columns ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.subscriptions_derive_plan_family()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  derived text;
BEGIN
  derived := coalesce(
    public.normalize_plan_family(NEW.plan_slug),
    public.normalize_plan_family(NEW.plan),
    public.normalize_plan_family(NEW.current_plan)
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.plan_family IS NULL THEN
      NEW.plan_family := derived;
    END IF;
    RETURN NEW;
  END IF;

  -- The writer set plan_family explicitly: respect it.
  IF NEW.plan_family IS DISTINCT FROM OLD.plan_family THEN
    RETURN NEW;
  END IF;

  -- The package changed but plan_family was left behind: follow the new package.
  IF derived IS NOT NULL AND (
       NEW.plan_slug IS DISTINCT FROM OLD.plan_slug
    OR NEW.plan IS DISTINCT FROM OLD.plan
    OR NEW.current_plan IS DISTINCT FROM OLD.current_plan
  ) THEN
    NEW.plan_family := derived;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.subscriptions_derive_plan_family() IS
  'BEFORE insert/update: keep plan_family (read first by the entitlement resolver) in step with plan_slug/plan/current_plan when a writer changes the package without setting plan_family.';

DROP TRIGGER IF EXISTS subscriptions_derive_plan_family_biu ON public.subscriptions;
CREATE TRIGGER subscriptions_derive_plan_family_biu
  BEFORE INSERT OR UPDATE OF plan, current_plan, plan_slug, plan_family ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.subscriptions_derive_plan_family();

-- ── 3. Company access row includes the owner's company-less rows ─────────────────────
CREATE OR REPLACE FUNCTION public.company_access_subscription(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.*
  FROM public.subscriptions s
  WHERE (p_company_id IS NOT NULL AND s.company_id = p_company_id)
     OR (p_company_id IS NOT NULL AND s.company_id IS NULL AND s.user_id IN (
           SELECT o.owner_id FROM public.organizations o WHERE o.id = p_company_id
           UNION
           SELECT p_user_id WHERE p_user_id IS NOT NULL
        ))
     OR (p_company_id IS NULL AND p_user_id IS NOT NULL AND s.user_id = p_user_id)
  ORDER BY
    CASE
      WHEN public.subscription_row_has_access(s) THEN 100
      WHEN lower(s.status) IN ('pending', 'processing') THEN 20
      WHEN lower(s.status) = 'expired' THEN 10
      ELSE 0
    END DESC,
    coalesce(s.updated_at, s.created_at) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.company_access_subscription(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.company_access_subscription(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.company_access_subscription(uuid, uuid) IS
  'The subscription row that decides a company''s package and access: company rows plus the owner''s company-less rows. Same ranking as pickAccessSubscriptionRow (server entitlements).';

-- ── Profile mirror: no invented Starter when the row has no package ──────────────────
CREATE OR REPLACE FUNCTION public.mirror_company_plan_to_profiles(p_company_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.subscriptions;
  fam text;
  st text;
  v_access boolean;
  prof_status text;
BEGIN
  s := public.company_access_subscription(p_company_id, p_user_id);
  IF s.id IS NULL THEN
    RETURN;
  END IF;

  -- Same order as server/src/billing/entitlements.js: catalog slug, then its cached family.
  fam := coalesce(
    public.normalize_plan_family(s.plan_slug),
    public.normalize_plan_family(s.plan_family),
    public.normalize_plan_family(s.plan),
    public.normalize_plan_family(s.current_plan)
  );
  -- No package on the row → no package in the mirror. Never invent Starter.
  st := lower(trim(coalesce(s.status, '')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN st := 'cancelled'; END IF;
  IF st = 'paused' THEN st := 'suspended'; END IF;
  IF st = 'trial' THEN st := 'trialing'; END IF;
  v_access := public.subscription_row_has_access(s);

  prof_status := CASE
    WHEN st IN ('pending', 'processing') THEN 'pending'
    WHEN st = 'active' THEN 'active'
    WHEN st = 'trialing' AND v_access THEN 'trial'
    WHEN st = 'trialing' THEN 'expired'
    WHEN st = 'past_due' THEN 'past_due'
    WHEN st = 'failed' THEN 'failed'
    WHEN st = 'cancelled' THEN 'cancelled'
    WHEN st = 'expired' THEN 'expired'
    WHEN st = 'suspended' THEN 'suspended'
    ELSE 'cancelled'
  END;

  UPDATE public.profiles p
  SET
    plan = fam,
    subscription_plan = fam,
    subscription_status = prof_status,
    trial_started_at = CASE WHEN st = 'trialing' THEN coalesce(s.trial_started_at, p.trial_started_at) ELSE p.trial_started_at END,
    trial_ends_at = CASE
      WHEN st = 'trialing' THEN s.trial_ends_at
      WHEN st = 'active' AND coalesce(s.subscription_source, '') <> 'admin' THEN NULL
      ELSE p.trial_ends_at
    END,
    is_pro = v_access,
    updated_at = now()
  WHERE p.id IN (
    SELECT o.owner_id FROM public.organizations o WHERE p_company_id IS NOT NULL AND o.id = p_company_id
    UNION
    SELECT m.user_id FROM public.memberships m WHERE p_company_id IS NOT NULL AND m.org_id = p_company_id AND m.user_id IS NOT NULL
    UNION
    SELECT p_user_id WHERE p_company_id IS NULL AND p_user_id IS NOT NULL
  )
  AND (
    p.plan IS DISTINCT FROM fam
    OR p.subscription_plan IS DISTINCT FROM fam
    OR p.subscription_status IS DISTINCT FROM prof_status
    OR p.is_pro IS DISTINCT FROM v_access
    OR (st = 'trialing' AND p.trial_ends_at IS DISTINCT FROM s.trial_ends_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mirror_company_plan_to_profiles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mirror_company_plan_to_profiles(uuid, uuid) TO service_role;

-- A company-less row belongs to its owner's companies too: re-mirror those members.
CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  org_id uuid;
BEGIN
  PERFORM public.mirror_company_plan_to_profiles(NEW.company_id, CASE WHEN NEW.company_id IS NULL THEN NEW.user_id END);
  IF NEW.company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    FOR org_id IN SELECT o.id FROM public.organizations o WHERE o.owner_id = NEW.user_id LOOP
      PERFORM public.mirror_company_plan_to_profiles(org_id, NULL);
    END LOOP;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.company_id IS DISTINCT FROM NEW.company_id AND OLD.company_id IS NOT NULL THEN
    PERFORM public.mirror_company_plan_to_profiles(OLD.company_id, NULL);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_profile_from_subscription_row failed for subscription %: %', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;
