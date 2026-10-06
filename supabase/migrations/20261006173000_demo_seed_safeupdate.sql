-- Production safeupdate rejects UPDATE without a WHERE clause. The historical demo
-- seed updated its temp table that way, so provisioning failed and demo login returned 500.

CREATE OR REPLACE FUNCTION public.demo_seed_historical_counter_sales(
  p_org uuid,
  p_owner uuid,
  p_connection uuid,
  p_register uuid,
  p_session_closed uuid,
  p_day0 timestamptz,
  p_menus jsonb,
  p_cashiers text[]
)
RETURNS TABLE (cash_yesterday numeric, sale_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cash numeric := 0;
  v_count integer := 0;
BEGIN
  IF NOT public.is_demo_org(p_org) THEN
    RAISE EXCEPTION 'demo_seed_historical_counter_sales: % is not a demo organization', p_org USING ERRCODE = '42501';
  END IF;

  DROP TABLE IF EXISTS pg_temp.demo_hist_sales;
  DROP TABLE IF EXISTS pg_temp.demo_hist_lines;

  CREATE TEMP TABLE demo_hist_sales ON COMMIT DROP AS
  WITH days AS (
    SELECT d, k,
      row_number() OVER (ORDER BY d DESC, k ASC)::integer AS seq
    FROM generate_series(1, 27) AS d
    CROSS JOIN LATERAL generate_series(1, 5 + (d % 4)) AS k
  ),
  planned AS (
    SELECT
      days.seq,
      days.d,
      days.k,
      gen_random_uuid() AS intent_id,
      gen_random_uuid() AS sale_id,
      p_day0 - make_interval(days => days.d)
        + interval '7 hours 20 minutes'
        + make_interval(mins => days.k * 83 + (days.d % 5) * 7) AS sold_at,
      CASE WHEN (days.d + days.k) % 5 IN (0, 1, 2) THEN 'card' ELSE 'cash' END AS method,
      p_menus -> ((days.d * 3 + days.k * 5) % jsonb_array_length(p_menus)) AS items,
      p_cashiers[1 + (days.k % 3)] AS cashier,
      CASE WHEN days.d = 1 THEN p_session_closed END AS session_id
    FROM days
  ),
  lines AS (
    SELECT
      p.seq,
      e.ordinality::integer AS n,
      svc.id AS product_id,
      svc.sku,
      svc.name,
      svc.price,
      svc.stock_quantity,
      (e.value ->> 1)::numeric AS qty,
      round(svc.price * (e.value ->> 1)::numeric, 2) AS line_total
    FROM planned p
    CROSS JOIN LATERAL jsonb_array_elements(p.items) WITH ORDINALITY AS e(value, ordinality)
    JOIN public.services svc ON svc.org_id = p_org AND svc.sku = e.value ->> 0
  ),
  totals AS (
    SELECT
      seq,
      sum(line_total) AS total,
      jsonb_agg(
        jsonb_build_object(
          'product_id', product_id,
          'line_id', format('line-%s-%s', n, product_id),
          'sku', sku,
          'barcode', '',
          'name', name,
          'quantity', qty,
          'unit_price', price,
          'line_total', line_total,
          'stock_on_hand', stock_quantity
        )
        ORDER BY n
      ) AS line_items
    FROM lines
    GROUP BY seq
  )
  SELECT
    p.seq,
    p.d,
    p.k,
    p.intent_id,
    p.sale_id,
    p.sold_at,
    p.method,
    p.cashier,
    p.session_id,
    t.total,
    t.line_items,
    CASE
      WHEN p.method = 'card' THEN NULL::numeric
      WHEN t.total <= 50 THEN 50::numeric
      WHEN t.total <= 100 THEN 100::numeric
      WHEN t.total <= 200 THEN 200::numeric
      ELSE ceil(t.total / 100) * 100
    END AS tendered
  FROM planned p
  JOIN totals t ON t.seq = p.seq;

  ALTER TABLE demo_hist_sales ADD COLUMN change_due numeric;
  -- Production rejects UPDATE without WHERE (safeupdate). seq is always set.
  UPDATE demo_hist_sales
  SET change_due = CASE WHEN method = 'card' THEN NULL ELSE tendered - total END
  WHERE seq IS NOT NULL;

  ALTER TABLE demo_hist_sales ADD COLUMN receipt text;
  UPDATE demo_hist_sales
  SET receipt = format(
    'POS-%s-%s',
    to_char(sold_at AT TIME ZONE 'Africa/Johannesburg', 'YYYYMMDD'),
    upper(to_hex(4096 + seq))
  )
  WHERE seq IS NOT NULL;

  CREATE TEMP TABLE demo_hist_lines ON COMMIT DROP AS
  SELECT
    s.sale_id,
    s.sold_at,
    e.ordinality::integer AS n,
    svc.id AS product_id,
    (e.value ->> 1)::numeric AS qty
  FROM demo_hist_sales s
  CROSS JOIN LATERAL jsonb_array_elements(
    p_menus -> ((s.d * 3 + s.k * 5) % jsonb_array_length(p_menus))
  ) WITH ORDINALITY AS e(value, ordinality)
  JOIN public.services svc ON svc.org_id = p_org AND svc.sku = e.value ->> 0;

  INSERT INTO public.payment_intents (
    id, org_id, source_kind, provider, amount, currency, status, idempotency_key, created_by, metadata, created_at, updated_at
  )
  SELECT
    s.intent_id, p_org, 'pos',
    CASE WHEN s.method = 'card' THEN 'card_terminal' ELSE 'cash' END,
    s.total, 'ZAR', 'paid', format('demo-seed-%s', s.seq), p_owner,
    CASE WHEN s.method = 'card' THEN jsonb_build_object(
      'origin', 'pos', 'settlement', 'terminal', 'payment_method', 'card', 'demo_simulated', true,
      'terminal_confirmed', true, 'demo_outcome', 'succeeded', 'demo_seed', true)
    ELSE jsonb_build_object(
      'origin', 'pos', 'settlement', 'till', 'payment_method', 'cash',
      'amount_tendered', s.tendered, 'change_due', s.change_due, 'demo_seed', true)
    END,
    s.sold_at, s.sold_at
  FROM demo_hist_sales s;

  INSERT INTO public.pos_sales_events (
    id, org_id, connection_id, external_id, provider, status, total_amount, currency, payment_method, occurred_at,
    items, inventory_applied, inventory_result, receipt_number, cashier_id, sale_kind, amount_tendered, change_due,
    payment_intent_id, register_id, session_id, raw_payload, created_at
  )
  SELECT
    s.sale_id, p_org, p_connection, format('demo-sale-%s', s.seq), 'paidly', 'completed', s.total, 'ZAR',
    s.method, s.sold_at,
    s.line_items, true, jsonb_build_object('applied', true, 'direction', 'out', 'source', 'demo_seed'),
    s.receipt, p_owner, 'sale', s.tendered, s.change_due,
    s.intent_id, p_register, s.session_id,
    jsonb_build_object(
      'brand_name', 'Mavela Café',
      'cashier_name', s.cashier,
      'subtotal', s.total, 'discount_amount', 0, 'tax_amount', 0, 'tax_rate', 0,
      'amount_tendered', s.tendered, 'change_due', s.change_due,
      'settlement', CASE WHEN s.method = 'card' THEN 'terminal' ELSE 'till' END,
      'tab_label', NULL, 'order_number', NULL
    ),
    s.sold_at
  FROM demo_hist_sales s;

  UPDATE public.payment_intents pi
  SET pos_sale_event_id = s.sale_id,
      metadata = pi.metadata || jsonb_build_object('checkout', jsonb_build_object(
        'items', s.line_items, 'subtotal', s.total, 'receipt_number', s.receipt,
        'tab_id', NULL, 'tab_label', NULL))
  FROM demo_hist_sales s
  WHERE pi.id = s.intent_id;

  INSERT INTO public.inventory_movements (product_id, quantity, type, source, reference_id, created_at)
  SELECT l.product_id, l.qty, 'out', 'pos', l.sale_id, (l.sold_at AT TIME ZONE 'UTC')
  FROM demo_hist_lines l;

  SELECT
    coalesce(sum(total) FILTER (WHERE d = 1 AND method = 'cash'), 0),
    count(*)::integer
  INTO v_cash, v_count
  FROM demo_hist_sales;

  DROP TABLE IF EXISTS pg_temp.demo_hist_lines;
  DROP TABLE IF EXISTS pg_temp.demo_hist_sales;

  cash_yesterday := v_cash;
  sale_count := v_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.demo_seed_historical_counter_sales(uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_seed_historical_counter_sales(uuid, uuid, uuid, uuid, uuid, timestamptz, jsonb, text[]) TO service_role;
