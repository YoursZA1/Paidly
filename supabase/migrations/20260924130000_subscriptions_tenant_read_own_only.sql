-- Subscription history: tenant reads are own-row only, with no SECURITY DEFINER helpers in the path.
--
-- Symptom (Billing & Invoices): "Could not load subscription history" — the browser SELECT on
-- public.subscriptions returned a PostgREST error (not an empty result).
--
-- Why 20260814210000 was not enough:
--   * It re-added "subscriptions_user_select_own" but left billing v2's other permissive policies in
--     place. Postgres ORs permissive policies and initialises every policy expression for the query,
--     including the function EXECUTE check, so a failure in any of them fails the whole SELECT:
--       - "subscriptions_select_company" → is_billing_admin() + current_company_id()
--         → get_my_tenant_context() → get_my_onboarding_context()   (all SECURITY DEFINER)
--       - "subscriptions_admin_all"      → is_billing_admin()
--     Production has had EXECUTE on these SECURITY DEFINER helpers revoked outside of migrations
--     (anon now gets 42501 "permission denied for function current_company_id"; no migration does
--     that). If the same sweep reached `authenticated`, every signed-in SELECT here raises 42501.
--   * "subscriptions_select_company" also let any company member read the company's agreements,
--     i.e. company_id acted as the sole boundary — not "own records only".
--   * anon still held table-level SELECT (RLS returned zero rows, but the grant was never needed).
--
-- Ownership boundary after this migration:
--   authenticated: SELECT only, and only rows where subscriptions.user_id = auth.uid().
--   anon:          no privileges.
--   Writes and admin reads: service_role only (PayFast ITN, crons, /api/subscriptions/*,
--   /api/admin/subscriptions — see server/src/billing/*). No browser code path reads
--   subscriptions through a JWT except the Billing & Invoices history (useMySubscriptionsQuery).
--
-- Data: no rows are modified. subscriptions.user_id REFERENCES auth.users(id), and every writer
-- (ITN custom_str1, /api/subscriptions/create, start_owner_system_trial, admin API) stores the auth
-- user id. Rows with user_id NULL (admin-created without a user) simply stay invisible to tenants;
-- see supabase/scripts/subscriptions_ownership_report.sql to review them.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ── Privileges ───────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.subscriptions FROM authenticated;
GRANT SELECT ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

-- ── Policies ─────────────────────────────────────────────────────────────────
-- Drop every existing policy on the table (known v1/v2 names and anything added out-of-band via the
-- dashboard), so exactly one canonical SELECT policy remains. Logged for the migration audit trail.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
  LOOP
    RAISE NOTICE 'subscriptions: dropping policy %', pol.policyname;
    EXECUTE format('DROP POLICY %I ON public.subscriptions', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "subscriptions_user_select_own"
  ON public.subscriptions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NOT NULL
    AND user_id = (SELECT auth.uid())
  );

COMMENT ON POLICY "subscriptions_user_select_own" ON public.subscriptions IS
  'Only tenant read path: own rows by auth.uid(). No helper functions. Admin/writes use service_role via /api.';

-- ── Post-conditions (abort the migration if the end state is not exactly this) ──
DO $$
DECLARE
  v_policies text[];
BEGIN
  SELECT array_agg(policyname ORDER BY policyname) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'subscriptions';

  IF v_policies IS DISTINCT FROM ARRAY['subscriptions_user_select_own']::text[] THEN
    RAISE EXCEPTION 'subscriptions: unexpected policies %', v_policies;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.subscriptions'::regclass) THEN
    RAISE EXCEPTION 'subscriptions: RLS is not enabled';
  END IF;

  IF has_table_privilege('anon', 'public.subscriptions', 'SELECT')
     OR has_table_privilege('anon', 'public.subscriptions', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'subscriptions: anon must have no privileges';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.subscriptions', 'SELECT') THEN
    RAISE EXCEPTION 'subscriptions: authenticated is missing SELECT';
  END IF;

  IF has_table_privilege('authenticated', 'public.subscriptions', 'INSERT,UPDATE,DELETE,TRUNCATE') THEN
    RAISE EXCEPTION 'subscriptions: authenticated must not write';
  END IF;
END $$;
