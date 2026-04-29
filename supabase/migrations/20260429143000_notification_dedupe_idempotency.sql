-- Dedupe + idempotency hardening for affiliate applications and PayFast payments.
-- - One pending affiliate application per email and per authenticated user.
-- - submit_affiliate_application becomes update-or-insert for pending rows.
-- - PayFast payment events deduped by (payment_method, reference_number).

-- Normalize existing duplicate pending affiliate applications before adding unique indexes.
WITH ranked_pending_email AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY lower(trim(coalesce(email, '')))
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.affiliate_applications
  WHERE status = 'pending'
)
UPDATE public.affiliate_applications a
SET
  status = 'rejected',
  updated_at = now()
FROM ranked_pending_email r
WHERE a.id = r.id
  AND r.rn > 1;

WITH ranked_pending_user AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.affiliate_applications
  WHERE status = 'pending'
    AND user_id IS NOT NULL
)
UPDATE public.affiliate_applications a
SET
  status = 'rejected',
  updated_at = now()
FROM ranked_pending_user r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_pending_email_uniq
  ON public.affiliate_applications (lower(trim(email)))
  WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_applications_pending_user_uniq
  ON public.affiliate_applications (user_id)
  WHERE status = 'pending' AND user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_affiliate_application(
  p_email text,
  p_full_name text,
  p_why_promote text DEFAULT NULL,
  p_audience_platform text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_full_name, ''));
  v_user_id uuid := auth.uid();
  v_existing_id uuid := null;
BEGIN
  IF v_email IS NULL OR length(v_email) < 3 OR length(v_email) > 320 OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT id
    INTO v_existing_id
    FROM public.affiliate_applications
    WHERE status = 'pending'
      AND user_id = v_user_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing_id IS NULL THEN
    SELECT id
    INTO v_existing_id
    FROM public.affiliate_applications
    WHERE status = 'pending'
      AND lower(trim(email)) = v_email
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.affiliate_applications
    SET
      email = v_email,
      full_name = v_name,
      why_promote = CASE WHEN p_why_promote IS NULL OR btrim(p_why_promote) = '' THEN NULL ELSE left(btrim(p_why_promote), 4000) END,
      audience_platform = CASE WHEN p_audience_platform IS NULL OR btrim(p_audience_platform) = '' THEN NULL ELSE left(btrim(p_audience_platform), 500) END,
      user_id = COALESCE(user_id, v_user_id),
      updated_at = now()
    WHERE id = v_existing_id;

    RETURN jsonb_build_object('ok', true, 'id', v_existing_id, 'updated', true);
  END IF;

  INSERT INTO public.affiliate_applications (
    email,
    full_name,
    why_promote,
    audience_platform,
    status,
    user_id
  )
  VALUES (
    v_email,
    v_name,
    CASE WHEN p_why_promote IS NULL OR btrim(p_why_promote) = '' THEN NULL ELSE left(btrim(p_why_promote), 4000) END,
    CASE WHEN p_audience_platform IS NULL OR btrim(p_audience_platform) = '' THEN NULL ELSE left(btrim(p_audience_platform), 500) END,
    'pending',
    v_user_id
  )
  RETURNING id INTO v_existing_id;

  RETURN jsonb_build_object('ok', true, 'id', v_existing_id, 'updated', false);
END;
$$;

COMMENT ON FUNCTION public.submit_affiliate_application(text, text, text, text) IS
  'Public affiliate apply upserts pending application by user/email to prevent duplicates.';

-- Ensure columns used by backend PayFast flow exist in DBs that still have legacy payment column names.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS payment_date timestamptz;

-- Backfill aliases from legacy columns where available.
UPDATE public.payments
SET payment_method = COALESCE(payment_method, method)
WHERE payment_method IS NULL
  AND method IS NOT NULL;

UPDATE public.payments
SET reference_number = COALESCE(reference_number, reference)
WHERE reference_number IS NULL
  AND reference IS NOT NULL;

UPDATE public.payments
SET payment_date = COALESCE(payment_date, paid_at)
WHERE payment_date IS NULL
  AND paid_at IS NOT NULL;

-- Remove duplicate PayFast events before enforcing uniqueness.
WITH ranked_payfast AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY payment_method, reference_number
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.payments
  WHERE payment_method = 'payfast'
    AND reference_number IS NOT NULL
    AND btrim(reference_number) <> ''
)
DELETE FROM public.payments p
USING ranked_payfast r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payments_payfast_reference_uniq
  ON public.payments (payment_method, reference_number)
  WHERE payment_method = 'payfast'
    AND reference_number IS NOT NULL
    AND btrim(reference_number) <> '';
