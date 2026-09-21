-- Admin platform metrics in ONE round trip.
--
-- Before: the admin overview issued ~45 separate PostgREST queries per load
-- (7.5s measured against production; functions run in iad1, database in the EU).
-- This function returns the same numbers as one jsonb payload, so the dashboard,
-- analytics charts and report tables all read a single set of definitions.
--
-- Definitions (agreed 2026-09-21):
--   * Active business  = organisation with a LIVE subscription
--                        (active | trialing with a future end | past_due inside grace).
--                        Total businesses is reported separately.
--   * Total users      = auth.users (real accounts). profiles may contain orphans.
--   * Employees        = memberships excluding owners and disabled members.
--   * Paidly revenue   = completed payment_history rows. Customer invoice/POS money
--                        is tenant revenue and is never counted here.
--   * Contracted MRR   = monthly-equivalent amount of live subscriptions. Reported
--                        alongside paid MRR (live subs with >=1 completed payment)
--                        so an unpaid book cannot look like earned revenue.
--
-- Day/month buckets use Africa/Johannesburg, so "today" matches what an admin sees.
-- service_role only (the API already authenticates and authorises the caller).

-- ── Helpers ─────────────────────────────────────────────────────────────────

/** Live = paid product access right now (mirrors shared/subscriptionAccess.js). */
CREATE OR REPLACE FUNCTION public.admin_subscription_is_live(
  p_status text,
  p_trial_ends_at timestamptz,
  p_grace_ends_at timestamptz
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE lower(trim(COALESCE(p_status, '')))
    WHEN 'active' THEN true
    WHEN 'trialing' THEN p_trial_ends_at IS NULL OR p_trial_ends_at > now()
    WHEN 'past_due' THEN p_grace_ends_at IS NOT NULL AND p_grace_ends_at > now()
    ELSE false
  END;
$$;

/** Recurring amount normalised to one month. */
CREATE OR REPLACE FUNCTION public.admin_monthly_amount(p_amount numeric, p_cycle text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE lower(trim(COALESCE(p_cycle, 'monthly')))
    WHEN 'annual' THEN COALESCE(p_amount, 0) / 12.0
    WHEN 'yearly' THEN COALESCE(p_amount, 0) / 12.0
    WHEN 'annually' THEN COALESCE(p_amount, 0) / 12.0
    WHEN 'quarterly' THEN COALESCE(p_amount, 0) / 3.0
    WHEN 'biannual' THEN COALESCE(p_amount, 0) / 6.0
    ELSE COALESCE(p_amount, 0)
  END;
$$;

/**
 * total / period / previous / today counts for one activity table.
 * Dynamic so a table missing in an environment degrades to `unavailable`
 * instead of failing the whole dashboard.
 */
CREATE OR REPLACE FUNCTION public.admin_usage_counts(
  p_table text,
  p_column text,
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_day_start timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RETURN jsonb_build_object('unavailable', true, 'reason', format('%s is not available in this environment.', p_table));
  END IF;
  EXECUTE format(
    'SELECT jsonb_build_object(
       ''total'', count(*),
       ''period'', count(*) FILTER (WHERE %1$I >= $1 AND %1$I < $2),
       ''previous'', count(*) FILTER (WHERE %1$I >= $3 AND %1$I < $4),
       ''today'', count(*) FILTER (WHERE %1$I >= $5)
     ) FROM public.%2$I',
    p_column, p_table
  )
  INTO result
  USING p_from, p_to, p_prev_from, p_prev_to, p_day_start;
  RETURN COALESCE(result, '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('unavailable', true, 'reason', SQLERRM);
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_platform_metrics(
  p_from timestamptz,
  p_to timestamptz,
  p_prev_from timestamptz,
  p_prev_to timestamptz,
  p_series_days integer DEFAULT 30,
  p_series_months integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  tz constant text := 'Africa/Johannesburg';
  day_start timestamptz := (date_trunc('day', now() AT TIME ZONE tz)) AT TIME ZONE tz;
  payload jsonb := '{}'::jsonb;
  v jsonb;
BEGIN
  -- ── Businesses ────────────────────────────────────────────────────────────
  BEGIN
    SELECT jsonb_build_object(
      'total', count(*),
      'customer', count(*) FILTER (WHERE COALESCE(o.is_internal, false) = false),
      'internal', count(*) FILTER (WHERE COALESCE(o.is_internal, false) = true),
      'active', count(*) FILTER (
        WHERE COALESCE(o.is_internal, false) = false
          AND EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE (s.company_id = o.id OR (o.owner_id IS NOT NULL AND s.user_id = o.owner_id))
              AND public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)
          )
      ),
      'without_subscription', count(*) FILTER (
        WHERE COALESCE(o.is_internal, false) = false
          AND NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.company_id = o.id OR (o.owner_id IS NOT NULL AND s.user_id = o.owner_id)
          )
      ),
      'new', count(*) FILTER (WHERE COALESCE(o.is_internal, false) = false AND o.created_at >= p_from AND o.created_at < p_to),
      'new_previous', count(*) FILTER (WHERE COALESCE(o.is_internal, false) = false AND o.created_at >= p_prev_from AND o.created_at < p_prev_to)
    )
    INTO v
    FROM public.organizations o;
    payload := payload || jsonb_build_object('businesses', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('businesses', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- ── Users (auth accounts, not profile rows) ───────────────────────────────
  BEGIN
    SELECT jsonb_build_object(
      'total', count(*),
      'new', count(*) FILTER (WHERE u.created_at >= p_from AND u.created_at < p_to),
      'new_previous', count(*) FILTER (WHERE u.created_at >= p_prev_from AND u.created_at < p_prev_to),
      'confirmed', count(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL)
    )
    INTO v
    FROM auth.users u;
    payload := payload || jsonb_build_object('users', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('users', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- Profile rows without an auth user are a data-integrity signal, not a user count.
  BEGIN
    SELECT jsonb_build_object(
      'profiles', count(*),
      'orphans', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id))
    )
    INTO v
    FROM public.profiles p;
    payload := payload || jsonb_build_object('profile_integrity', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('profile_integrity', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- ── Workforce (employees exclude owners) ──────────────────────────────────
  BEGIN
    SELECT jsonb_build_object(
      'members', count(*),
      'employees', count(*) FILTER (
        WHERE lower(COALESCE(m.role, '')) <> 'owner'
          AND (to_jsonb(m) ->> 'disabled_at') IS NULL
      ),
      'owners', count(*) FILTER (WHERE lower(COALESCE(m.role, '')) = 'owner'),
      'companies_with_employees', count(DISTINCT m.org_id) FILTER (WHERE lower(COALESCE(m.role, '')) <> 'owner')
    )
    INTO v
    FROM public.memberships m;
    payload := payload || jsonb_build_object('workforce', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('workforce', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- ── Subscriptions ─────────────────────────────────────────────────────────
  BEGIN
    SELECT jsonb_build_object(
      'total', count(*),
      'active', count(*) FILTER (WHERE s.status = 'active'),
      'trialing', count(*) FILTER (WHERE s.status = 'trialing' AND (s.trial_ends_at IS NULL OR s.trial_ends_at > now())),
      'trial_expired_unflipped', count(*) FILTER (WHERE s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at <= now()),
      'past_due', count(*) FILTER (WHERE s.status = 'past_due'),
      'cancelled', count(*) FILTER (WHERE s.status = 'cancelled'),
      'expired', count(*) FILTER (WHERE s.status = 'expired'),
      'pending', count(*) FILTER (WHERE s.status IN ('pending', 'processing')),
      'suspended', count(*) FILTER (WHERE s.status = 'suspended'),
      'failed', count(*) FILTER (WHERE s.status = 'failed'),
      'live', count(*) FILTER (WHERE public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)),
      'admin_granted', count(*) FILTER (WHERE s.status = 'active' AND COALESCE(s.subscription_source, '') = 'admin'),
      'cancelled_in_period', count(*) FILTER (WHERE s.cancelled_at >= p_from AND s.cancelled_at < p_to),
      'created_in_period', count(*) FILTER (WHERE s.created_at >= p_from AND s.created_at < p_to),
      'contracted_mrr', COALESCE(sum(public.admin_monthly_amount(s.amount, s.billing_cycle))
        FILTER (WHERE public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)), 0),
      'paid_mrr', COALESCE(sum(public.admin_monthly_amount(s.amount, s.billing_cycle)) FILTER (
        WHERE public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)
          AND EXISTS (
            SELECT 1 FROM public.payment_history ph
            WHERE ph.subscription_id = s.id AND ph.payment_status = 'completed'
          )
      ), 0),
      'live_without_payment', count(*) FILTER (
        WHERE public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)
          AND NOT EXISTS (
            SELECT 1 FROM public.payment_history ph
            WHERE ph.subscription_id = s.id AND ph.payment_status = 'completed'
          )
      )
    )
    INTO v
    FROM public.subscriptions s;
    payload := payload || jsonb_build_object('subscriptions', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('subscriptions', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- Live subscriptions grouped by plan family (drives the plan mix chart).
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
      SELECT
        COALESCE(NULLIF(lower(trim(s.plan_family)), ''), 'unknown') AS family,
        count(*) AS live,
        COALESCE(sum(public.admin_monthly_amount(s.amount, s.billing_cycle)), 0) AS mrr
      FROM public.subscriptions s
      WHERE public.admin_subscription_is_live(s.status, s.trial_ends_at, s.grace_ends_at)
      GROUP BY 1
      ORDER BY 2 DESC
    ) t;
    payload := payload || jsonb_build_object('plan_mix', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('plan_mix', '[]'::jsonb);
  END;

  -- ── Paidly payments (payment_history is the only revenue source) ──────────
  BEGIN
    SELECT jsonb_build_object(
      'total_rows', count(*),
      'completed_period', count(*) FILTER (WHERE ph.payment_status = 'completed' AND ph.created_at >= p_from AND ph.created_at < p_to),
      'completed_previous', count(*) FILTER (WHERE ph.payment_status = 'completed' AND ph.created_at >= p_prev_from AND ph.created_at < p_prev_to),
      'revenue_period', COALESCE(sum(ph.amount) FILTER (WHERE ph.payment_status = 'completed' AND ph.created_at >= p_from AND ph.created_at < p_to), 0),
      'revenue_previous', COALESCE(sum(ph.amount) FILTER (WHERE ph.payment_status = 'completed' AND ph.created_at >= p_prev_from AND ph.created_at < p_prev_to), 0),
      'revenue_all_time', COALESCE(sum(ph.amount) FILTER (WHERE ph.payment_status = 'completed'), 0),
      'failed_period', count(*) FILTER (WHERE ph.payment_status = 'failed' AND ph.created_at >= p_from AND ph.created_at < p_to),
      'refunded_period', count(*) FILTER (WHERE ph.payment_status = 'refunded' AND ph.created_at >= p_from AND ph.created_at < p_to),
      'pending_period', count(*) FILTER (WHERE ph.payment_status = 'pending' AND ph.created_at >= p_from AND ph.created_at < p_to)
    )
    INTO v
    FROM public.payment_history ph;
    payload := payload || jsonb_build_object('payments', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('payments', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  BEGIN
    SELECT jsonb_build_object(
      'pending', count(*) FILTER (WHERE pi.status IN ('pending', 'requires_action', 'processing')),
      'failed', count(*) FILTER (WHERE pi.status = 'failed')
    )
    INTO v
    FROM public.payment_intents pi;
    payload := payload || jsonb_build_object('payment_intents', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('payment_intents', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- ── Product usage (counts only — customer amounts stay with the tenant) ───
  payload := payload || jsonb_build_object('usage', jsonb_build_object(
    'invoices', public.admin_usage_counts('invoices', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'quotes', public.admin_usage_counts('quotes', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'payslips', public.admin_usage_counts('payslips', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'pos_sales', public.admin_usage_counts('pos_sales_events', 'occurred_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'recurring_invoices', public.admin_usage_counts('recurring_invoices', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'leave_requests', public.admin_usage_counts('leave_requests', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'pay_runs', public.admin_usage_counts('pay_runs', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start),
    'waitlist', public.admin_usage_counts('waitlist_signups', 'created_at', p_from, p_to, p_prev_from, p_prev_to, day_start)
  ));

  -- POS adoption: businesses that have actually connected a till.
  BEGIN
    SELECT jsonb_build_object(
      'connections', count(*),
      'businesses', count(DISTINCT c.org_id)
    )
    INTO v
    FROM public.pos_connections c;
    payload := payload || jsonb_build_object('pos', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('pos', jsonb_build_object('unavailable', true, 'reason', SQLERRM));
  END;

  -- ── Daily series (Africa/Johannesburg days, zero-filled) ──────────────────
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO v FROM (
      SELECT
        d AS day,
        (SELECT count(*) FROM auth.users u WHERE (u.created_at AT TIME ZONE tz)::date = d) AS new_users,
        (SELECT count(*) FROM public.organizations o
          WHERE COALESCE(o.is_internal, false) = false AND (o.created_at AT TIME ZONE tz)::date = d) AS new_businesses,
        (SELECT count(*) FROM public.invoices i WHERE (i.created_at AT TIME ZONE tz)::date = d) AS invoices,
        (SELECT count(*) FROM public.quotes q WHERE (q.created_at AT TIME ZONE tz)::date = d) AS quotes,
        (SELECT COALESCE(sum(ph.amount), 0) FROM public.payment_history ph
          WHERE ph.payment_status = 'completed' AND (ph.created_at AT TIME ZONE tz)::date = d) AS revenue
      FROM generate_series(
        (now() AT TIME ZONE tz)::date - (GREATEST(p_series_days, 1) - 1),
        (now() AT TIME ZONE tz)::date,
        1
      ) AS d
    ) t;
    payload := payload || jsonb_build_object('series_daily', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('series_daily', '[]'::jsonb);
  END;

  -- ── Monthly series ────────────────────────────────────────────────────────
  BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.month), '[]'::jsonb) INTO v FROM (
      SELECT
        to_char(m, 'YYYY-MM') AS month,
        (SELECT count(*) FROM auth.users u
          WHERE date_trunc('month', u.created_at AT TIME ZONE tz) = m) AS new_users,
        (SELECT count(*) FROM public.organizations o
          WHERE COALESCE(o.is_internal, false) = false
            AND date_trunc('month', o.created_at AT TIME ZONE tz) = m) AS new_businesses,
        (SELECT count(*) FROM public.subscriptions s
          WHERE date_trunc('month', s.created_at AT TIME ZONE tz) = m) AS subscriptions_started,
        (SELECT count(*) FROM public.subscriptions s
          WHERE s.cancelled_at IS NOT NULL AND date_trunc('month', s.cancelled_at AT TIME ZONE tz) = m) AS subscriptions_cancelled,
        (SELECT COALESCE(sum(ph.amount), 0) FROM public.payment_history ph
          WHERE ph.payment_status = 'completed'
            AND date_trunc('month', ph.created_at AT TIME ZONE tz) = m) AS revenue,
        (SELECT count(*) FROM public.payment_history ph
          WHERE ph.payment_status = 'completed'
            AND date_trunc('month', ph.created_at AT TIME ZONE tz) = m) AS payments
      FROM generate_series(
        date_trunc('month', (now() AT TIME ZONE tz)) - make_interval(months => GREATEST(p_series_months, 1) - 1),
        date_trunc('month', (now() AT TIME ZONE tz)),
        interval '1 month'
      ) AS m
    ) t;
    payload := payload || jsonb_build_object('series_monthly', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('series_monthly', '[]'::jsonb);
  END;

  -- Earliest real activity, so charts can say "limited history" instead of implying zeros.
  BEGIN
    SELECT jsonb_build_object(
      'first_business_at', (SELECT min(created_at) FROM public.organizations),
      'first_user_at', (SELECT min(created_at) FROM auth.users),
      'first_payment_at', (SELECT min(created_at) FROM public.payment_history WHERE payment_status = 'completed')
    ) INTO v;
    payload := payload || jsonb_build_object('history', v);
  EXCEPTION WHEN OTHERS THEN
    payload := payload || jsonb_build_object('history', '{}'::jsonb);
  END;

  RETURN payload || jsonb_build_object(
    'generated_at', now(),
    'timezone', tz,
    'window', jsonb_build_object('from', p_from, 'to', p_to, 'prev_from', p_prev_from, 'prev_to', p_prev_to)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_usage_counts(text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz, timestamptz, timestamptz, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_usage_counts(text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_is_live(text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_monthly_amount(numeric, text) TO service_role;

COMMENT ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz, timestamptz, timestamptz, integer, integer) IS
  'Single-round-trip admin platform metrics. Active business = live subscription; users = auth.users; employees exclude owners; revenue = completed payment_history. Buckets use Africa/Johannesburg. service_role only.';
