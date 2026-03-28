-- Deterministic affiliate flow: affiliates.status pending|approved, one referral per referred user,
-- commissions at most one row per referral per UTC day (recurring renewals).

-- ---------------------------------------------------------------------------
-- 1) affiliates.status: active/suspended → pending/approved
-- ---------------------------------------------------------------------------

ALTER TABLE public.affiliates DROP CONSTRAINT IF EXISTS affiliates_status_check;

UPDATE public.affiliates SET status = 'approved' WHERE status = 'active';
UPDATE public.affiliates SET status = 'pending' WHERE status = 'suspended';

ALTER TABLE public.affiliates
  ADD CONSTRAINT affiliates_status_check
  CHECK (status IN ('pending', 'approved'));

ALTER TABLE public.affiliates ALTER COLUMN status SET DEFAULT 'pending';

-- ---------------------------------------------------------------------------
-- 2) referrals: global unique referred_user_id (first touch wins); dedupe first
-- ---------------------------------------------------------------------------

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY referred_user_id ORDER BY created_at ASC) AS rn
  FROM public.referrals
)
DELETE FROM public.referrals r
USING ranked x
WHERE r.id = x.id AND x.rn > 1;

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_affiliate_referred_unique;

ALTER TABLE public.referrals
  ADD CONSTRAINT referrals_referred_user_id_key UNIQUE (referred_user_id);

-- ---------------------------------------------------------------------------
-- 3) commissions: prevent duplicate commission for same referral on same UTC day
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS commissions_referral_billing_day_uidx
  ON public.commissions (referral_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE referral_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) RLS: referred user can read own referral row (in addition to affiliate owner policy)
-- ---------------------------------------------------------------------------

CREATE POLICY "referrals_select_referred_user_own_row"
  ON public.referrals FOR SELECT TO authenticated
  USING (referred_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) RPC: clicks + signup use approved affiliates; signup upsert on referred_user_id
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
  WHERE upper(a.referral_code) = v_code AND a.status = 'approved';
  IF aid IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.affiliate_clicks (affiliate_id) VALUES (aid);
END;
$$;

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
  WHERE upper(a.referral_code) = v_code AND a.status = 'approved';

  IF aff.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF aff.user_id = p_new_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referrals (affiliate_id, referred_user_id, status)
  VALUES (aff.id, p_new_user_id, 'signed_up')
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON INDEX public.commissions_referral_billing_day_uidx IS 'At most one commission row per referral per UTC calendar day (recurring).';

-- Manual approval (SQL Editor):
-- INSERT INTO public.affiliates (user_id, application_id, referral_code, commission_rate, status)
-- VALUES ('<user_uuid>', '<application_uuid>', 'BR123', 0.2, 'approved');
