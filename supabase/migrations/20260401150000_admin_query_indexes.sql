-- Admin/query performance indexes for growing datasets.
-- Focus columns requested: created_at, status, user_id, affiliate_id.
-- Safe to run multiple times and safe across schema drift.

DO $$
BEGIN
  -- profiles (PlatformUser)
  IF to_regclass('public.profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS profiles_created_at_idx ON public.profiles (created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS profiles_status_created_at_idx ON public.profiles (status, created_at DESC)';
    END IF;
  END IF;

  -- subscriptions
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS subscriptions_status_created_at_idx ON public.subscriptions (status, created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'user_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS subscriptions_user_id_created_at_idx ON public.subscriptions (user_id, created_at DESC)';
    END IF;
  END IF;

  -- affiliate_applications (AffiliateSubmission)
  IF to_regclass('public.affiliate_applications') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_applications' AND column_name = 'status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_applications' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS affiliate_applications_status_created_at_idx ON public.affiliate_applications (status, created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_applications' AND column_name = 'user_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'affiliate_applications' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS affiliate_applications_user_id_created_at_idx ON public.affiliate_applications (user_id, created_at DESC)';
    END IF;
  END IF;

  -- affiliates (canonical affiliate profile used by /dashboard/affiliate)
  IF to_regclass('public.affiliates') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliates' AND column_name = 'user_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS affiliates_user_id_idx ON public.affiliates (user_id)';
  END IF;

  -- commissions (AffiliatePayout / affiliate dashboard ledger)
  IF to_regclass('public.commissions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'affiliate_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS commissions_affiliate_id_created_at_idx ON public.commissions (affiliate_id, created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'status'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS commissions_status_created_at_idx ON public.commissions (status, created_at DESC)';
    END IF;
  END IF;

  -- referrals and affiliate_clicks (affiliate dashboard aggregation)
  IF to_regclass('public.referrals') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'affiliate_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'referrals' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS referrals_affiliate_id_created_at_idx ON public.referrals (affiliate_id, created_at DESC)';
  END IF;

  IF to_regclass('public.affiliate_clicks') IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliate_clicks' AND column_name = 'affiliate_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'affiliate_clicks' AND column_name = 'created_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS affiliate_clicks_affiliate_id_created_at_idx ON public.affiliate_clicks (affiliate_id, created_at DESC)';
  END IF;

  -- waitlist_signups
  IF to_regclass('public.waitlist_signups') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'waitlist_signups' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx ON public.waitlist_signups (created_at DESC)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'waitlist_signups' AND column_name = 'converted'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'waitlist_signups' AND column_name = 'created_at'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS waitlist_signups_converted_created_at_idx ON public.waitlist_signups (converted, created_at DESC)';
    END IF;
  END IF;
END $$;
