-- Affiliate program: applications, partners, referrals, commissions, clicks.
-- Manual approval: update affiliate_applications + insert affiliates (see comments at end).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.affiliate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  why_promote text,
  audience_platform text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_applications_email ON public.affiliate_applications (lower(email));
CREATE INDEX idx_affiliate_applications_status ON public.affiliate_applications (status);

CREATE TABLE public.affiliates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.affiliate_applications (id) ON DELETE SET NULL,
  referral_code text NOT NULL,
  commission_rate numeric NOT NULL DEFAULT 0.2 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliates_user_id_key UNIQUE (user_id),
  CONSTRAINT affiliates_referral_code_key UNIQUE (referral_code)
);

CREATE INDEX idx_affiliates_referral_code ON public.affiliates (upper(referral_code));

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'subscribed', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_affiliate_referred_unique UNIQUE (affiliate_id, referred_user_id)
);

CREATE INDEX idx_referrals_affiliate ON public.referrals (affiliate_id);
CREATE INDEX idx_referrals_referred ON public.referrals (referred_user_id);

CREATE TABLE public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
  referral_id uuid REFERENCES public.referrals (id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_commissions_affiliate ON public.commissions (affiliate_id);

CREATE TABLE public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_clicks_affiliate ON public.affiliate_clicks (affiliate_id);

-- ---------------------------------------------------------------------------
-- RPC: validate referral code, record click (anon ok)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_affiliate_click(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  aid uuid;
BEGIN
  v_code := upper(trim(COALESCE(p_code, '')));
  IF length(v_code) < 2 THEN
    RETURN;
  END IF;
  SELECT a.id INTO aid
  FROM public.affiliates a
  WHERE upper(a.referral_code) = v_code AND a.status = 'active';
  IF aid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.affiliate_clicks (affiliate_id) VALUES (aid);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: attach referred user to affiliate (must be the new user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_referral_signup(p_code text, p_new_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  aff public.affiliates%ROWTYPE;
BEGIN
  IF p_new_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_user');
  END IF;
  IF auth.uid() IS DISTINCT FROM p_new_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_mismatch');
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  IF length(v_code) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO aff
  FROM public.affiliates a
  WHERE upper(a.referral_code) = v_code AND a.status = 'active';

  IF aff.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF aff.user_id = p_new_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referrals (affiliate_id, referred_user_id, status)
  VALUES (aff.id, p_new_user_id, 'signed_up')
  ON CONFLICT (affiliate_id, referred_user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_affiliate_click(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_referral_signup(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- Applications: public can insert (marketing form)
CREATE POLICY "affiliate_applications_anon_insert"
  ON public.affiliate_applications FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "affiliate_applications_auth_insert"
  ON public.affiliate_applications FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "affiliate_applications_own_select"
  ON public.affiliate_applications FOR SELECT TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());

CREATE POLICY "affiliate_applications_admin_select"
  ON public.affiliate_applications FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "affiliate_applications_admin_update"
  ON public.affiliate_applications FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "affiliate_applications_admin_delete"
  ON public.affiliate_applications FOR DELETE TO authenticated
  USING (public.is_admin());

-- Affiliates: only own row
CREATE POLICY "affiliates_select_own"
  ON public.affiliates FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "affiliates_admin_select"
  ON public.affiliates FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "affiliates_admin_insert"
  ON public.affiliates FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "affiliates_admin_update"
  ON public.affiliates FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "affiliates_admin_delete"
  ON public.affiliates FOR DELETE TO authenticated
  USING (public.is_admin());

-- Referrals: affiliate owner can read their referrals
CREATE POLICY "referrals_select_by_affiliate_owner"
  ON public.referrals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = referrals.affiliate_id AND a.user_id = auth.uid()
    )
  );

-- Commissions: affiliate owner
CREATE POLICY "commissions_select_by_affiliate_owner"
  ON public.commissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = commissions.affiliate_id AND a.user_id = auth.uid()
    )
  );

-- Clicks: affiliate owner can aggregate
CREATE POLICY "affiliate_clicks_select_by_affiliate_owner"
  ON public.affiliate_clicks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = affiliate_clicks.affiliate_id AND a.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.affiliate_applications IS 'Public affiliate applications; approve manually then insert into affiliates.';
COMMENT ON TABLE public.affiliates IS 'Approved partners; referral_code unique; commission_rate e.g. 0.2 = 20%.';
COMMENT ON TABLE public.referrals IS 'Referred users; prevent self-referral in record_referral_signup.';
COMMENT ON TABLE public.commissions IS 'Earned amounts from subscription payments; wire from billing webhooks later.';

-- ---------------------------------------------------------------------------
-- Manual approval (run in SQL Editor as service role / postgres)
-- ---------------------------------------------------------------------------
-- 1) Approve application:
--    UPDATE public.affiliate_applications SET status = 'approved', updated_at = now() WHERE id = '<application_id>';
-- 2) Link user (must exist in auth.users):
--    INSERT INTO public.affiliates (user_id, application_id, referral_code, commission_rate, status)
--    VALUES ('<user_uuid>', '<application_id>', 'BR123', 0.2, 'approved');
-- 3) Optional: set application user_id:
--    UPDATE public.affiliate_applications SET user_id = '<user_uuid>' WHERE id = '<application_id>';
