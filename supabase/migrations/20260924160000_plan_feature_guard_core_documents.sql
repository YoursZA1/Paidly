-- Core documents need an active subscription at the database too (2026-09-24).
--
-- 20260924120000_plan_feature_db_guard.sql guarded the Business/Growth tables the SPA writes through
-- PostgREST, but not invoices, quotes and clients. Every package includes them, yet a company with no
-- access (trial expired, subscription expired / suspended / cancelled after period end, or none at
-- all) must not use them either. The SPA's expired lock hides the pages, and emailing an invoice is
-- gated by the server, but a direct PostgREST INSERT still succeeded.
--
-- Same guard, same rules (paidly_enforce_plan_feature → paidly_assert_plan_feature):
--   * INSERT only. Editing, paying or deleting existing records stays possible after a lapse, and the
--     data is kept.
--   * End users only (auth.uid() set). Server routes and crons (service role: recurring invoices, POS
--     sale invoices), anonymous public flows (public quote / invoice pages) and platform admins pass.
--   * Company = the row's org_id (else the caller's company), resolved by company_access_subscription.
--   * Report-only switch shared with the other guards:
--       ALTER ROLE authenticated SET app.paidly_entitlements_enforce = 'off';
--
-- Idempotent; skips tables that do not exist.

DO $$
DECLARE
  pair text[];
  pairs text[][] := ARRAY[
    ARRAY['invoices', 'invoices'],
    ARRAY['quotes', 'quotes'],
    ARRAY['clients', 'clients']
  ];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY pairs LOOP
    IF to_regclass('public.' || pair[1]) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS paidly_plan_feature_guard ON public.%I', pair[1]);
      EXECUTE format(
        'CREATE TRIGGER paidly_plan_feature_guard BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.paidly_enforce_plan_feature(%L)',
        pair[1], pair[2]
      );
    END IF;
  END LOOP;
END $$;
