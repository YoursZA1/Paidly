-- Serialize payroll calculate vs leave approval without putting PAYE math in SQL.
-- Additive only. RPCs are service_role only (same pattern as consume_rate_limit_bucket).

CREATE OR REPLACE FUNCTION public.workforce_leave_overlap_fingerprint(
  p_org_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT md5(
    COALESCE(
      string_agg(
        r.id::text || ':' || r.status || ':' || r.start_date::text || ':' || r.end_date::text
          || ':' || COALESCE(r.half_day::text, 'f')
          || ':' || COALESCE(t.paid::text, 't'),
        '|'
        ORDER BY r.id
      ),
      'empty'
    )
  )
  FROM public.leave_requests r
  LEFT JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.org_id = p_org_id
    AND r.status IN ('pending', 'approved')
    AND r.start_date <= p_period_end
    AND r.end_date >= p_period_start;
$$;

CREATE OR REPLACE FUNCTION public.claim_pay_run_for_calculate(
  p_org_id uuid,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.pay_runs%ROWTYPE;
  v_fingerprint text;
  v_leave jsonb;
BEGIN
  IF p_org_id IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID');
  END IF;

  SELECT * INTO v_run
  FROM public.pay_runs
  WHERE id = p_run_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_run.finalized_at IS NOT NULL OR v_run.status IN ('cancelled', 'paid') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOCKED');
  END IF;

  IF v_run.status = 'processing'
     AND v_run.updated_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAY_RUN_BUSY');
  END IF;

  PERFORM 1
  FROM public.leave_requests r
  WHERE r.org_id = p_org_id
    AND r.status IN ('pending', 'approved')
    AND r.start_date <= v_run.period_end
    AND r.end_date >= v_run.period_start
  ORDER BY r.id
  FOR UPDATE;

  UPDATE public.pay_runs
  SET status = 'processing', updated_at = now()
  WHERE id = p_run_id AND org_id = p_org_id;

  v_fingerprint := public.workforce_leave_overlap_fingerprint(
    p_org_id,
    v_run.period_start,
    v_run.period_end
  );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'payroll_profile_id', r.payroll_profile_id,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'half_day', r.half_day,
        'status', r.status,
        'leave_types', jsonb_build_object(
          'paid', t.paid,
          'exclude_weekends', t.exclude_weekends
        )
      )
      ORDER BY r.id
    ),
    '[]'::jsonb
  )
  INTO v_leave
  FROM public.leave_requests r
  LEFT JOIN public.leave_types t ON t.id = r.leave_type_id
  WHERE r.org_id = p_org_id
    AND r.status = 'approved'
    AND r.start_date <= v_run.period_end
    AND r.end_date >= v_run.period_start;

  RETURN jsonb_build_object(
    'ok', true,
    'leave_fingerprint', v_fingerprint,
    'leave_rows', v_leave
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_pay_run_calculate(
  p_org_id uuid,
  p_run_id uuid,
  p_items jsonb,
  p_leave_fingerprint text,
  p_gross_total numeric,
  p_deductions_total numeric,
  p_net_total numeric,
  p_employee_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.pay_runs%ROWTYPE;
  v_fingerprint text;
  v_item jsonb;
BEGIN
  SELECT * INTO v_run
  FROM public.pay_runs
  WHERE id = p_run_id AND org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_run.finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOCKED');
  END IF;

  v_fingerprint := public.workforce_leave_overlap_fingerprint(
    p_org_id,
    v_run.period_start,
    v_run.period_end
  );

  IF v_fingerprint IS DISTINCT FROM COALESCE(p_leave_fingerprint, '') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEAVE_CHANGED', 'leave_fingerprint', v_fingerprint);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    UPDATE public.pay_run_items
    SET
      status = 'calculated',
      employee_number = COALESCE(v_item->>'employee_number', employee_number),
      employee_name = COALESCE(v_item->>'employee_name', employee_name),
      membership_id = COALESCE((v_item->>'membership_id')::uuid, membership_id),
      base_pay = (v_item->>'base_pay')::numeric,
      overtime_hours = (v_item->>'overtime_hours')::numeric,
      overtime_rate = (v_item->>'overtime_rate')::numeric,
      overtime_amount = (v_item->>'overtime_amount')::numeric,
      earnings = COALESCE(v_item->'earnings', earnings),
      deductions = COALESCE(v_item->'deductions', deductions),
      gross_pay = (v_item->>'gross_pay')::numeric,
      taxable_income = (v_item->>'taxable_income')::numeric,
      statutory_deductions = COALESCE(v_item->'statutory_deductions', statutory_deductions),
      other_deductions = COALESCE(v_item->'other_deductions', other_deductions),
      total_deductions = (v_item->>'total_deductions')::numeric,
      net_pay = (v_item->>'net_pay')::numeric,
      calculation = COALESCE(v_item->'calculation', calculation),
      warnings = COALESCE(v_item->'warnings', warnings),
      base_salary_snapshot = (v_item->>'base_salary_snapshot')::numeric,
      unpaid_leave_days = (v_item->>'unpaid_leave_days')::numeric,
      unpaid_leave_amount = (v_item->>'unpaid_leave_amount')::numeric
    WHERE id = (v_item->>'id')::uuid
      AND pay_run_id = p_run_id
      AND org_id = p_org_id;
  END LOOP;

  UPDATE public.pay_runs
  SET
    status = 'calculated',
    calculated_at = now(),
    gross_total = p_gross_total,
    deductions_total = p_deductions_total,
    net_total = p_net_total,
    employee_count = COALESCE(p_employee_count, employee_count)
  WHERE id = p_run_id AND org_id = p_org_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_open_pay_runs_for_leave(
  p_org_id uuid,
  p_start date,
  p_end date,
  p_balance_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR p_start IS NULL OR p_end IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID');
  END IF;

  PERFORM 1
  FROM public.pay_runs
  WHERE org_id = p_org_id
    AND finalized_at IS NULL
    AND status <> 'cancelled'
    AND period_start <= p_end
    AND period_end >= p_start
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.leave_requests
  WHERE org_id = p_org_id
    AND status IN ('pending', 'approved')
    AND start_date <= p_end
    AND end_date >= p_start
  ORDER BY id
  FOR UPDATE;

  IF p_balance_id IS NOT NULL THEN
    PERFORM 1 FROM public.leave_balances WHERE id = p_balance_id FOR UPDATE;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.workforce_leave_overlap_fingerprint(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pay_run_for_calculate(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_pay_run_calculate(uuid, uuid, jsonb, text, numeric, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_open_pay_runs_for_leave(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.workforce_leave_overlap_fingerprint(uuid, date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pay_run_for_calculate(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_pay_run_calculate(uuid, uuid, jsonb, text, numeric, numeric, numeric, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_open_pay_runs_for_leave(uuid, date, date, uuid) TO service_role;

COMMENT ON FUNCTION public.workforce_leave_overlap_fingerprint(uuid, date, date) IS
  'Hash of overlapping pending+approved leave. Pending is included so approve/reject during calculate trips LEAVE_CHANGED.';

COMMENT ON FUNCTION public.claim_pay_run_for_calculate(uuid, uuid) IS
  'Marks a pay run processing and returns overlapping approved leave. Payroll math stays in calculatePayroll.js.';

COMMENT ON FUNCTION public.commit_pay_run_calculate(uuid, uuid, jsonb, text, numeric, numeric, numeric, integer) IS
  'Writes calculatePayroll snapshots if the leave fingerprint is unchanged. Does not compute PAYE/UIF.';

COMMENT ON FUNCTION public.lock_open_pay_runs_for_leave(uuid, date, date, uuid) IS
  'FOR UPDATE overlapping open pay runs, leave requests, and the leave balance row. Call before decideLeaveRequest writes.';
