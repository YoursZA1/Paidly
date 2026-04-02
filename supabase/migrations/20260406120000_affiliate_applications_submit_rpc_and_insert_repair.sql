-- Fix: "new row violates row-level security policy for table affiliate_applications" on the public apply form.
--
-- Causes we have seen:
-- - INSERT not granted to anon/authenticated, or INSERT policies missing/dropped on a drifted DB.
-- - Direct PostgREST insert then fails RLS even though the form should be open to everyone.
--
-- 1) Idempotent repair: GRANT + permissive INSERT policies (same as 20260404130000).
-- 2) submit_affiliate_application(): SECURITY DEFINER insert using auth.uid() for optional user_id — works even if
--    table INSERT policies are wrong (RPC still runs as table owner; only this controlled path writes).

ALTER TABLE public.affiliate_applications ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON TABLE public.affiliate_applications TO anon, authenticated;

DROP POLICY IF EXISTS "affiliate_applications_anon_insert" ON public.affiliate_applications;
CREATE POLICY "affiliate_applications_anon_insert"
  ON public.affiliate_applications
  FOR INSERT
  TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "affiliate_applications_auth_insert" ON public.affiliate_applications;
CREATE POLICY "affiliate_applications_auth_insert"
  ON public.affiliate_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

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
BEGIN
  IF v_email IS NULL OR length(v_email) < 3 OR length(v_email) > 320 OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
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
    auth.uid()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.submit_affiliate_application(text, text, text, text) IS
  'Public affiliate apply: one pending row; auth.uid() links logged-in users; bypasses RLS via controlled definer.';

REVOKE ALL ON FUNCTION public.submit_affiliate_application(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_affiliate_application(text, text, text, text) TO anon, authenticated;
