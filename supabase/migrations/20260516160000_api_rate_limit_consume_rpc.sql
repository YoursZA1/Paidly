-- Shared API rate-limit buckets (service_role only). Used by Vercel + Express auth routes
-- when RATE_LIMIT_PERSIST=1 so limits apply across serverless instances.

CREATE TABLE IF NOT EXISTS public.api_rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  hit_count integer NOT NULL DEFAULT 0,
  window_reset_at timestamptz NOT NULL
);

REVOKE ALL ON TABLE public.api_rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.api_rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit_bucket(
  p_bucket_key text,
  p_max_hits integer,
  p_window_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_reset timestamptz;
  v_count integer;
  v_retry integer;
BEGIN
  IF p_bucket_key IS NULL OR length(trim(p_bucket_key)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'retry_after_seconds', 0);
  END IF;
  IF p_max_hits IS NULL OR p_max_hits < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN jsonb_build_object('ok', true, 'retry_after_seconds', 0);
  END IF;

  SELECT window_reset_at, hit_count
  INTO v_reset, v_count
  FROM public.api_rate_limit_buckets
  WHERE bucket_key = p_bucket_key
  FOR UPDATE;

  IF NOT FOUND OR v_now >= v_reset THEN
    v_reset := v_now + make_interval(secs => p_window_seconds);
    v_count := 1;
    INSERT INTO public.api_rate_limit_buckets (bucket_key, hit_count, window_reset_at)
    VALUES (p_bucket_key, 1, v_reset)
    ON CONFLICT (bucket_key) DO UPDATE
      SET hit_count = 1, window_reset_at = EXCLUDED.window_reset_at;
  ELSE
    v_count := v_count + 1;
    UPDATE public.api_rate_limit_buckets
    SET hit_count = v_count
    WHERE bucket_key = p_bucket_key;
  END IF;

  IF v_count > p_max_hits THEN
    v_retry := greatest(1, ceil(extract(epoch FROM (v_reset - v_now)))::integer);
    RETURN jsonb_build_object('ok', false, 'retry_after_seconds', v_retry);
  END IF;

  RETURN jsonb_build_object('ok', true, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit_bucket(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit_bucket(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.consume_rate_limit_bucket(text, integer, integer) IS
  'Atomic fixed-window rate limit for API auth/abuse protection. service_role only.';
