-- Demo login: set-based historical POS seed, and a server-only pool of ready workspaces.
-- Login claims a prepared workspace (service role) instead of seeding ~180 sales on the request.
-- The browser still never chooses a user or a business. RLS is unchanged.
-- Unclaimed rows are not a session: the password is rotated when a visitor claims one.

ALTER TABLE public.demo_sessions
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Workspaces created before the pool are already in use.
UPDATE public.demo_sessions
SET claimed_at = created_at
WHERE claimed_at IS NULL AND purged_at IS NULL;

COMMENT ON COLUMN public.demo_sessions.claimed_at IS
  'Null while the workspace sits in the server-side demo pool. Set when a visitor is signed into it.';

-- Historical counter sales (27 days). Same menu rotation, tender math and receipt shape as
-- demo_seed_pos_sale, without a plpgsql call per sale.
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

CREATE OR REPLACE FUNCTION public.seed_demo_business(p_org uuid, p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := now();
  v_today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  v_day0 timestamptz := ((now() AT TIME ZONE 'Africa/Johannesburg')::date)::timestamp AT TIME ZONE 'Africa/Johannesburg';
  v_bank uuid;
  v_conn uuid;
  v_register uuid;
  v_session_open uuid;
  v_session_closed uuid;
  v_floor_main uuid;
  v_floor_patio uuid;
  v_client uuid[];
  v_supplier uuid[];
  v_inv uuid;
  v_quote uuid;
  v_quote_converted uuid;
  v_member uuid;
  v_manager uuid;
  v_tab uuid;
  v_ticket uuid;
  v_intent uuid;
  v_sale uuid;
  v_seq integer := 0;
  v_order integer := 1000;
  v_rec jsonb;
  v_item jsonb;
  v_i integer;
  v_k integer;
  v_d integer;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_issue date;
  v_status text;
  v_items jsonb;
  v_method text;
  v_at timestamptz;
  v_cashiers text[] := ARRAY['Ayesha Patel', 'Sibusiso Khoza', 'Naledi Mokoena'];
  v_counter_menus jsonb := '[
    [["MC-CAP",1],["MC-MUF",1]],
    [["MC-LAT",2]],
    [["MC-AME",1],["MC-CRO",1]],
    [["MC-FLW",1]],
    [["MC-CHB",1],["MC-CHP",1],["MC-SFT",1]],
    [["MC-CKW",1],["MC-WTR",1]],
    [["MC-ESP",2],["MC-CKE",1]],
    [["MC-ICE",1],["MC-MUF",1]],
    [["MC-CKB",1],["MC-CHP",1]],
    [["MC-CAP",2],["MC-CRO",2]],
    [["MC-BFW",1],["MC-SFT",1]],
    [["MC-HOT",1],["MC-CKE",1]],
    [["MC-SAL",1],["MC-WTR",1]],
    [["MC-LAT",1],["MC-CRO",1]]
  ]'::jsonb;
  v_cash_today numeric := 0;
  v_cash_yesterday numeric := 0;
BEGIN
  IF NOT public.is_demo_org(p_org) THEN
    RAISE EXCEPTION 'seed_demo_business: % is not a demo organization', p_org USING ERRCODE = '42501';
  END IF;

  -- Banking details shown on invoices (clearly fictional).
  INSERT INTO public.banking_details (org_id, bank_name, account_name, account_number, routing_number, payment_method,
    additional_info, is_default, created_by_id)
  VALUES (p_org, 'Demo Bank', 'Mavela Café (Pty) Ltd', 'DEMO-000000000', '000000', 'bank_transfer',
    'Demo Mode — fictional account. Use the invoice number as your payment reference.', true, p_owner)
  RETURNING id INTO v_bank;

  -- ── Catalogue: menu products (stocked, on the till) + catering services ────────────
  INSERT INTO public.services (org_id, name, description, item_type, type, default_unit, unit, unit_type, default_rate,
    rate, unit_price, price, sku, category, cost_price, default_cost, cost_type, stock_quantity, low_stock_threshold,
    tax_category, is_active, pricing_type, pos_station, created_by_id, created_at, updated_at)
  SELECT p_org, x.name, x.descr, 'product', 'product', 'each', 'each', 'unit', x.price, x.price, x.price, x.price,
    x.sku, x.category, x.cost, x.cost, 'fixed', x.stock, x.low, 'standard', true, 'per_item', x.station, p_owner,
    v_now - interval '120 days', v_now - interval '120 days'
  FROM (VALUES
    ('MC-ESP', 'Espresso', 'Double shot, house blend', 'Coffee', 24.00, 6.00, 220, 30, 'bar'),
    ('MC-AME', 'Americano', 'Espresso with hot water', 'Coffee', 30.00, 7.00, 210, 30, 'bar'),
    ('MC-CAP', 'Cappuccino', 'Espresso, steamed milk, foam', 'Coffee', 36.00, 9.00, 190, 30, 'bar'),
    ('MC-LAT', 'Latte', 'Espresso with steamed milk', 'Coffee', 38.00, 10.00, 180, 30, 'bar'),
    ('MC-FLW', 'Flat White', 'Ristretto with velvety milk', 'Coffee', 38.00, 10.00, 160, 30, 'bar'),
    ('MC-ICE', 'Iced Coffee', 'Cold brew over ice with milk', 'Coffee', 42.00, 12.00, 45, 15, 'bar'),
    ('MC-HOT', 'Hot Chocolate', 'Rich cocoa with steamed milk', 'Coffee', 36.00, 9.00, 120, 20, 'bar'),
    ('MC-CHB', 'Cheeseburger', '180g beef patty, cheddar, pickles', 'Food', 95.00, 38.00, 40, 10, 'kitchen'),
    ('MC-CKB', 'Chicken Burger', 'Grilled chicken breast, peri-peri mayo', 'Food', 89.00, 34.00, 36, 10, 'kitchen'),
    ('MC-CKW', 'Chicken Wrap', 'Grilled chicken, slaw, avo', 'Food', 79.00, 29.00, 8, 10, 'kitchen'),
    ('MC-BFW', 'Beef Wrap', 'Pulled beef, peppers, chakalaka', 'Food', 85.00, 33.00, 22, 10, 'kitchen'),
    ('MC-CHP', 'Chips', 'Hand-cut, sea salt', 'Food', 35.00, 9.00, 60, 15, 'kitchen'),
    ('MC-SAL', 'Garden Salad', 'Greens, feta, seeds, vinaigrette', 'Food', 68.00, 24.00, 4, 8, 'kitchen'),
    ('MC-CKE', 'Chocolate Cake Slice', 'Triple-layer chocolate cake', 'Bakery', 48.00, 16.00, 14, 6, 'bar'),
    ('MC-MUF', 'Blueberry Muffin', 'Baked fresh every morning', 'Bakery', 32.00, 10.00, 6, 8, 'bar'),
    ('MC-CRO', 'Butter Croissant', 'All-butter, flaky', 'Bakery', 34.00, 12.00, 24, 8, 'bar'),
    ('MC-SFT', 'Soft Drink 330ml', 'Assorted cans', 'Drinks', 25.00, 11.00, 96, 24, 'bar'),
    ('MC-WTR', 'Bottled Water 500ml', 'Still or sparkling', 'Drinks', 20.00, 7.00, 9, 12, 'bar')
  ) AS x(sku, name, descr, category, price, cost, stock, low, station);

  INSERT INTO public.services (org_id, name, description, item_type, type, default_unit, unit, default_rate, rate,
    unit_price, price, sku, category, cost_price, default_cost, cost_type, tax_category, is_active, pricing_type,
    created_by_id, created_at, updated_at)
  SELECT p_org, x.name, x.descr, 'service', 'service', x.unit, x.unit, x.price, x.price, x.price, x.price, x.sku,
    'Catering', x.cost, x.cost, 'fixed', 'standard', true, x.pricing, p_owner,
    v_now - interval '120 days', v_now - interval '120 days'
  FROM (VALUES
    ('SV-CAT', 'Event Catering (per guest)', 'Canapés, mains and dessert, served', 'guest', 185.00, 82.00, 'per_item'),
    ('SV-BAR', 'Mobile Coffee Bar (per hour)', 'Barista, machine and unlimited coffee', 'hour', 650.00, 240.00, 'hourly'),
    ('SV-PLT', 'Breakfast Platter (serves 10)', 'Pastries, fruit, yoghurt and granola', 'platter', 890.00, 390.00, 'per_item'),
    ('SV-DEL', 'Delivery & Setup', 'Delivery within 25 km, setup and collection', 'job', 120.00, 60.00, 'fixed')
  ) AS x(sku, name, descr, unit, price, cost, pricing);

  -- ── Suppliers ─────────────────────────────────────────────────────────────────────
  WITH ins AS (
    INSERT INTO public.suppliers (org_id, name, email, phone, address, payment_terms, lead_time_days, notes, created_by, created_at)
    SELECT p_org, x.name, x.email, x.phone, x.address, x.terms, x.lead, x.notes, p_owner, v_now - interval '150 days'
    FROM (VALUES
      (1, 'Highveld Coffee Roasters', 'orders@highveldroasters.example', '+27 11 555 0141', '8 Roast Lane, Maboneng, Johannesburg', 'Net 30', 3, 'House blend and single-origin beans'),
      (2, 'Karoo Fresh Dairy', 'sales@karoofresh.example', '+27 11 555 0162', '41 Dairy Road, Kya Sand, Randburg', 'Net 14', 1, 'Full-cream and oat milk, daily delivery'),
      (3, 'Jozi Market Produce', 'hello@jozimarket.example', '+27 11 555 0187', 'Stall 22, City Deep Market, Johannesburg', 'COD', 1, 'Fresh vegetables and salad'),
      (4, 'PackRight Packaging', 'accounts@packright.example', '+27 10 555 0199', '17 Industry Street, Germiston', 'Net 30', 5, 'Cups, lids, takeaway boxes'),
      (5, 'CleanPro Hygiene', 'service@cleanpro.example', '+27 10 555 0120', '5 Sanitas Avenue, Midrand', 'Net 30', 2, 'Cleaning chemicals and consumables'),
      (6, 'Metro Butchery', 'orders@metrobutchery.example', '+27 11 555 0133', '90 Main Reef Road, Denver, Johannesburg', 'Net 7', 1, 'Beef patties and chicken')
    ) AS x(n, name, email, phone, address, terms, lead, notes)
    ORDER BY x.n
    RETURNING id, name
  )
  SELECT array_agg(id ORDER BY name) INTO v_supplier FROM ins;
  -- Order by name: 1 CleanPro, 2 Highveld, 3 Jozi, 4 Karoo, 5 Metro, 6 PackRight.

  -- ── Customers ─────────────────────────────────────────────────────────────────────
  WITH ins AS (
    INSERT INTO public.clients (org_id, name, contact_person, email, phone, address, industry, segment,
      payment_terms, payment_terms_days, notes, created_by_id, created_at, updated_at, last_activity_at)
    SELECT p_org, x.name, x.contact, x.email, x.phone, x.address, x.industry, x.segment,
      CASE WHEN x.terms = 14 THEN 'net_14' ELSE 'net_30' END, x.terms, x.notes, p_owner,
      v_now - make_interval(days => 200 - x.n * 7), v_now - make_interval(days => 200 - x.n * 7), v_now - make_interval(days => x.n)
    FROM (VALUES
      (1, 'Nkosi Events & Décor', 'Thandi Nkosi', 'thandi@nkosievents.example', '+27 82 555 0101', '14 Oxford Road, Rosebank, Johannesburg', 'Events', 'vip', 30, 'Books us for weddings and year-end functions.'),
      (2, 'Van der Merwe Attorneys', 'Pieter van der Merwe', 'pieter@vdmattorneys.example', '+27 83 555 0102', '3rd Floor, 22 Fredman Drive, Sandton', 'Legal', 'corporate', 30, 'Board-meeting catering on the last Thursday of the month.'),
      (3, 'Dlamini Property Group', 'Sipho Dlamini', 'sipho@dlaminiproperty.example', '+27 71 555 0103', '9 Bompas Road, Dunkeld, Johannesburg', 'Property', 'corporate', 30, 'Show-house and launch events.'),
      (4, 'Khumalo Architects', 'Nomvula Khumalo', 'nomvula@khumaloarch.example', '+27 72 555 0104', '31 Keyes Avenue, Rosebank, Johannesburg', 'Architecture', 'corporate', 30, NULL),
      (5, 'Pillay & Naidoo Accountants', 'Priya Naidoo', 'priya@pnaccountants.example', '+27 84 555 0105', '12 Wierda Road West, Sandton', 'Accounting', 'corporate', 30, 'Prefers invoices before the 25th.'),
      (6, 'Mokoena Fitness Studio', 'Lerato Mokoena', 'lerato@mokoenafitness.example', '+27 73 555 0106', '55 7th Street, Melville, Johannesburg', 'Fitness', 'smb', 14, NULL),
      (7, 'Botha Logistics', 'Johan Botha', 'johan@bothalogistics.example', '+27 82 555 0107', '120 Electron Avenue, Isando', 'Logistics', 'corporate', 30, 'Monthly office coffee supply.'),
      (8, 'Ndlovu Media House', 'Themba Ndlovu', 'themba@ndlovumedia.example', '+27 76 555 0108', '44 Stanley Avenue, Braamfontein', 'Media', 'smb', 30, NULL),
      (9, 'Sithole Primary School PTA', 'Zanele Sithole', 'pta@sitholeprimary.example', '+27 79 555 0109', '2 School Lane, Soweto', 'Education', 'community', 14, 'Fundraiser coffee stand each term.'),
      (10, 'Govender Dental Care', 'Kavitha Govender', 'kavitha@govenderdental.example', '+27 81 555 0110', '18 Linden Road, Bryanston', 'Healthcare', 'smb', 30, NULL),
      (11, 'Mahlangu Construction', 'Bongani Mahlangu', 'bongani@mahlanguconstruction.example', '+27 72 555 0111', '7 Steel Road, Midrand', 'Construction', 'corporate', 30, 'Site-team lunches, deliver before 12:00.'),
      (12, 'Jacobs Creative Agency', 'Megan Jacobs', 'megan@jacobscreative.example', '+27 83 555 0112', '27 4th Avenue, Parkhurst, Johannesburg', 'Marketing', 'smb', 30, NULL),
      (13, 'Zulu Coworking Hub', 'Ayanda Zulu', 'ayanda@zulucowork.example', '+27 74 555 0113', '61 Juta Street, Braamfontein', 'Coworking', 'corporate', 30, 'Members'' coffee bar and networking evenings.'),
      (14, 'Molefe Wedding Planners', 'Kagiso Molefe', 'kagiso@molefeweddings.example', '+27 71 555 0114', '10 Jan Smuts Avenue, Parktown North', 'Events', 'vip', 30, NULL),
      (15, 'Petersen Tech Solutions', 'Ryan Petersen', 'ryan@petersentech.example', '+27 84 555 0115', '5 Tyrwhitt Avenue, Rosebank, Johannesburg', 'Technology', 'corporate', 30, NULL)
    ) AS x(n, name, contact, email, phone, address, industry, segment, terms, notes)
    ORDER BY x.n
    RETURNING id, name
  )
  SELECT array_agg(i.id ORDER BY o.n) INTO v_client
  FROM ins i
  JOIN (VALUES
    (1, 'Nkosi Events & Décor'), (2, 'Van der Merwe Attorneys'), (3, 'Dlamini Property Group'),
    (4, 'Khumalo Architects'), (5, 'Pillay & Naidoo Accountants'), (6, 'Mokoena Fitness Studio'),
    (7, 'Botha Logistics'), (8, 'Ndlovu Media House'), (9, 'Sithole Primary School PTA'),
    (10, 'Govender Dental Care'), (11, 'Mahlangu Construction'), (12, 'Jacobs Creative Agency'),
    (13, 'Zulu Coworking Hub'), (14, 'Molefe Wedding Planners'), (15, 'Petersen Tech Solutions')
  ) AS o(n, name) ON o.name = i.name;

  -- ── Quotes (QUO-1001 … QUO-1008) ────────────────────────────────────────────────────
  v_i := 0;
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"c":3,"ago":45,"valid":30,"status":"converted","title":"Property launch catering","items":[["SV-CAT",60],["SV-BAR",5],["SV-DEL",1]]},
    {"c":11,"ago":9,"valid":30,"status":"accepted","title":"Heritage Day site lunch","items":[["MC-BFW",25],["MC-CKB",25],["MC-CHP",50],["MC-SFT",50]]},
    {"c":14,"ago":7,"valid":30,"status":"accepted","title":"Wedding dessert table","items":[["MC-CKE",60],["MC-MUF",40],["SV-DEL",1]]},
    {"c":8,"ago":5,"valid":30,"status":"sent","title":"Studio coffee bar — monthly","items":[["SV-BAR",8]]},
    {"c":15,"ago":3,"valid":30,"status":"sent","title":"Quarterly client breakfast","items":[["SV-PLT",4],["MC-CAP",40]]},
    {"c":6,"ago":2,"valid":30,"status":"viewed","title":"Members'' smoothie & salad day","items":[["MC-SAL",30],["MC-WTR",60]]},
    {"c":12,"ago":25,"valid":14,"status":"declined","title":"Agency retreat catering","items":[["SV-CAT",45],["SV-BAR",6],["SV-DEL",1]]},
    {"c":9,"ago":50,"valid":14,"status":"expired","title":"Sports day refreshments","items":[["MC-SFT",120],["MC-WTR",120],["MC-MUF",80]]}
  ]'::jsonb) LOOP
    v_i := v_i + 1;
    v_issue := v_today - (v_rec ->> 'ago')::integer;
    SELECT coalesce(sum(round(s.price * (e ->> 1)::numeric, 2)), 0) INTO v_subtotal
    FROM jsonb_array_elements(v_rec -> 'items') e
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0;
    v_tax := round(v_subtotal * 0.15, 2);
    INSERT INTO public.quotes (org_id, client_id, quote_number, status, project_title, project_description, valid_until,
      subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions, owner_company_name,
      owner_company_address, owner_email, owner_phone, owner_vat_number, owner_currency, created_by, user_id,
      banking_detail_id, sent_date, converted_at, vat_mode, created_at, updated_at)
    -- A converted quote is written as accepted, given its items, then converted (same path as the app).
    VALUES (p_org, v_client[(v_rec ->> 'c')::integer], 'QUO-' || (1000 + v_i),
      CASE WHEN v_rec ->> 'status' = 'converted' THEN 'accepted' ELSE v_rec ->> 'status' END, v_rec ->> 'title',
      'Prepared by Mavela Café catering.', v_issue + (v_rec ->> 'valid')::integer,
      v_subtotal, 15, v_tax, v_subtotal + v_tax, 'ZAR',
      'Prices include staff and equipment. Final guest numbers confirmed 5 days before the event.',
      '50% deposit secures the date. Balance due within 30 days of the invoice.',
      'Mavela Café', '112 Juta Street, Braamfontein, Johannesburg, 2001', 'hello@mavelacafe.example',
      '+27 11 555 0100', '4000000000', 'ZAR', p_owner, p_owner, v_bank,
      CASE WHEN v_rec ->> 'status' = 'draft' THEN NULL ELSE (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '10 hours' END,
      NULL,
      'VAT_EXCLUSIVE',
      (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '9 hours',
      (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '9 hours')
    RETURNING id INTO v_quote;

    v_k := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_rec -> 'items') LOOP
      v_k := v_k + 1;
      INSERT INTO public.quote_items (quote_id, service_id, catalog_item_id, service_name, description, quantity,
        unit_price, total_price, tax_rate, sku, item_type, unit_type)
      SELECT v_quote, s.id, s.id, s.name, s.description, (v_item ->> 1)::numeric, s.price,
        round(s.price * (v_item ->> 1)::numeric, 2), 15, s.sku, s.item_type, s.default_unit
      FROM public.services s WHERE s.org_id = p_org AND s.sku = v_item ->> 0;
    END LOOP;

    IF v_rec ->> 'status' = 'converted' THEN
      v_quote_converted := v_quote;
      PERFORM set_config('paidly.converting_quote', '1', true);
      UPDATE public.quotes
      SET status = 'converted', converted_at = (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '15 days'
      WHERE id = v_quote;
      PERFORM set_config('paidly.converting_quote', '', true);
    END IF;
  END LOOP;

  -- ── Invoices (INV-1001 … INV-1020) + payments ─────────────────────────────────────
  v_i := 0;
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"c":2,"ago":85,"due":30,"status":"paid","paid_after":12,"title":"Board meeting catering","items":[["SV-CAT",18],["MC-CAP",18],["MC-CRO",18]]},
    {"c":1,"ago":78,"due":30,"status":"paid","paid_after":20,"title":"Spring wedding tasting","items":[["SV-CAT",12],["SV-DEL",1]]},
    {"c":7,"ago":70,"due":30,"status":"paid","paid_after":9,"title":"Office coffee supply","items":[["MC-CAP",40],["MC-LAT",35],["MC-MUF",20]]},
    {"c":5,"ago":64,"due":30,"status":"paid","paid_after":14,"title":"Team breakfast","items":[["SV-PLT",2],["MC-FLW",20],["SV-DEL",1]]},
    {"c":13,"ago":57,"due":30,"status":"paid","paid_after":6,"title":"Members'' coffee bar","items":[["SV-BAR",4],["SV-DEL",1]]},
    {"c":10,"ago":50,"due":30,"status":"paid","paid_after":18,"title":"Staff appreciation lunch","items":[["MC-CHB",12],["MC-CKB",10],["MC-CHP",22],["MC-SFT",22]]},
    {"c":8,"ago":43,"due":30,"status":"paid","paid_after":11,"title":"Podcast launch event","items":[["SV-CAT",30],["SV-BAR",3]]},
    {"c":14,"ago":36,"due":30,"status":"paid","paid_after":8,"title":"Bridal shower catering","items":[["SV-CAT",25],["MC-CKE",25],["SV-DEL",1]]},
    {"c":3,"ago":30,"due":30,"status":"partially_paid","paid_share":0.5,"paid_after":2,"quote":true,"title":"Property launch catering","items":[["SV-CAT",60],["SV-BAR",5],["SV-DEL",1]]},
    {"c":11,"ago":58,"due":30,"status":"overdue","title":"Site team lunches","items":[["MC-BFW",20],["MC-CKW",20],["MC-SFT",40]]},
    {"c":6,"ago":49,"due":14,"status":"overdue","title":"Fitness open-day refreshments","items":[["MC-SAL",15],["MC-WTR",60],["MC-ICE",30]]},
    {"c":9,"ago":45,"due":14,"status":"overdue","title":"School fundraiser coffee stand","items":[["SV-BAR",5],["MC-MUF",60]]},
    {"c":15,"ago":38,"due":30,"status":"overdue","title":"Client workshop catering","items":[["SV-PLT",3],["MC-AME",25]]},
    {"c":4,"ago":20,"due":30,"status":"sent","title":"Studio opening catering","items":[["SV-CAT",35],["SV-DEL",1]]},
    {"c":12,"ago":14,"due":30,"status":"sent","title":"Creative day coffee bar","items":[["SV-BAR",3],["MC-CRO",30]]},
    {"c":2,"ago":9,"due":30,"status":"sent","title":"Partners'' breakfast","items":[["SV-PLT",2],["MC-CAP",20]]},
    {"c":7,"ago":6,"due":30,"status":"viewed","title":"Office coffee supply","items":[["MC-CAP",45],["MC-LAT",40],["MC-MUF",25]]},
    {"c":13,"ago":4,"due":30,"status":"viewed","title":"Members'' networking evening","items":[["SV-CAT",40],["MC-SFT",40]]},
    {"c":1,"ago":2,"due":30,"status":"draft","title":"Corporate year-end function","items":[["SV-CAT",80],["SV-BAR",4],["SV-DEL",1]]},
    {"c":10,"ago":0,"due":30,"status":"draft","title":"Monthly staff treats","items":[["MC-CKE",20],["MC-MUF",20]]}
  ]'::jsonb) LOOP
    v_i := v_i + 1;
    v_issue := v_today - (v_rec ->> 'ago')::integer;
    v_status := v_rec ->> 'status';
    SELECT coalesce(sum(round(s.price * (e ->> 1)::numeric, 2)), 0) INTO v_subtotal
    FROM jsonb_array_elements(v_rec -> 'items') e
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0;
    v_tax := round(v_subtotal * 0.15, 2);
    v_total := v_subtotal + v_tax;

    INSERT INTO public.invoices (org_id, client_id, invoice_number, status, project_title, project_description,
      invoice_date, delivery_date, subtotal, tax_rate, tax_amount, total_amount, currency, notes, terms_conditions,
      created_by, user_id, banking_detail_id, owner_company_name, owner_company_address, owner_email, owner_phone,
      owner_vat_number, owner_currency, source_quote_id, vat_mode, sent_to_email, public_share_token,
      created_at, updated_at)
    VALUES (p_org, v_client[(v_rec ->> 'c')::integer], 'INV-' || (1000 + v_i), v_status, v_rec ->> 'title',
      'Mavela Café catering and coffee services.', v_issue, v_issue + (v_rec ->> 'due')::integer,
      v_subtotal, 15, v_tax, v_total, 'ZAR',
      'Thank you for choosing Mavela Café.',
      'Payment due by the due date. Please use the invoice number as your reference.',
      p_owner, p_owner, v_bank, 'Mavela Café', '112 Juta Street, Braamfontein, Johannesburg, 2001',
      'hello@mavelacafe.example', '+27 11 555 0100', '4000000000', 'ZAR',
      CASE WHEN (v_rec ->> 'quote')::boolean THEN v_quote_converted END,
      'VAT_EXCLUSIVE',
      NULL,
      CASE WHEN v_status = 'draft' THEN NULL ELSE encode(sha256(convert_to(p_org::text || ':inv:' || v_i, 'UTF8')), 'hex') END,
      (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '9 hours',
      (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '9 hours')
    RETURNING id INTO v_inv;

    INSERT INTO public.invoice_items (invoice_id, service_id, catalog_item_id, service_name, description, quantity,
      unit_price, total_price, tax_rate, sku, item_type, unit_type)
    SELECT v_inv, s.id, s.id, s.name, s.description, (e ->> 1)::numeric, s.price,
      round(s.price * (e ->> 1)::numeric, 2), 15, s.sku, s.item_type, s.default_unit
    FROM jsonb_array_elements(v_rec -> 'items') WITH ORDINALITY AS t(e, ord)
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0
    ORDER BY ord;

    IF v_status IN ('paid', 'partially_paid') THEN
      INSERT INTO public.payments (org_id, invoice_id, client_id, amount, status, paid_at, payment_date, method,
        payment_method, reference, reference_number, notes, currency, created_at, updated_at)
      VALUES (p_org, v_inv, v_client[(v_rec ->> 'c')::integer],
        CASE WHEN v_status = 'paid' THEN v_total ELSE round(v_total * (v_rec ->> 'paid_share')::numeric, 2) END,
        'paid',
        (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + make_interval(days => (v_rec ->> 'paid_after')::integer, hours => 11),
        (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + make_interval(days => (v_rec ->> 'paid_after')::integer, hours => 11),
        'eft', 'eft', format('DEMO-EFT-%s', 1000 + v_i), 'INV-' || (1000 + v_i),
        CASE WHEN v_status = 'paid' THEN 'EFT received' ELSE '50% deposit received by EFT' END, 'ZAR',
        (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + make_interval(days => (v_rec ->> 'paid_after')::integer, hours => 11),
        (v_issue::timestamp AT TIME ZONE 'Africa/Johannesburg') + make_interval(days => (v_rec ->> 'paid_after')::integer, hours => 11));
    END IF;
  END LOOP;

  -- Numbering continues after the seed (next invoice INV-1021, next quote QUO-1009).
  INSERT INTO public.org_document_counters (org_id, doc_type, last_number)
  VALUES (p_org, 'invoice', 1020), (p_org, 'quote', 1008)
  ON CONFLICT (org_id, doc_type) DO UPDATE SET last_number = EXCLUDED.last_number;

  -- ── Expenses (last three months) ──────────────────────────────────────────────────
  INSERT INTO public.expenses (org_id, expense_number, category, description, amount, subtotal, vat, vat_rate, date,
    payment_method, vendor, supplier_id, receipt_number, is_claimable, capture_source, created_by_id, created_at, updated_at)
  SELECT p_org, format('EXP-%s', 1000 + x.n), x.category, x.descr, x.amount,
    CASE WHEN x.vat THEN round(x.amount / 1.15, 2) ELSE x.amount END,
    CASE WHEN x.vat THEN x.amount - round(x.amount / 1.15, 2) ELSE 0 END,
    CASE WHEN x.vat THEN 15 ELSE 0 END,
    v_today - x.ago, x.method, x.vendor,
    CASE WHEN x.supplier > 0 THEN v_supplier[x.supplier] END,
    format('R-%s', 5000 + x.n * 7), false, 'manual', p_owner,
    ((v_today - x.ago)::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '15 hours',
    ((v_today - x.ago)::timestamp AT TIME ZONE 'Africa/Johannesburg') + interval '15 hours'
  FROM (VALUES
    (1, 88, 'other', 'Monthly rent — shop 3', 'Braamfontein Property Trust', 28500.00, false, 'eft', 0),
    (2, 84, 'supplies', 'Coffee beans — house blend 20kg', 'Highveld Coffee Roasters', 6840.00, true, 'eft', 2),
    (3, 81, 'supplies', 'Milk and oat milk — fortnight', 'Karoo Fresh Dairy', 3120.00, true, 'eft', 4),
    (4, 76, 'utilities', 'Electricity — prepaid units', 'City Power', 5480.00, true, 'debit_card', 0),
    (5, 72, 'supplies', 'Fresh produce', 'Jozi Market Produce', 2270.00, false, 'cash', 3),
    (6, 66, 'supplies', 'Takeaway cups, lids and boxes', 'PackRight Packaging', 1935.00, true, 'eft', 6),
    (7, 60, 'supplies', 'Beef patties and chicken', 'Metro Butchery', 4410.00, true, 'eft', 5),
    (8, 58, 'other', 'Monthly rent — shop 3', 'Braamfontein Property Trust', 28500.00, false, 'eft', 0),
    (9, 55, 'utilities', 'Fibre internet 100 Mbps', 'Rain Fibre (demo)', 999.00, true, 'debit_card', 0),
    (10, 52, 'supplies', 'Coffee beans — house blend 20kg', 'Highveld Coffee Roasters', 6840.00, true, 'eft', 2),
    (11, 47, 'maintenance', 'Espresso machine service and descale', 'Barista Tech Services', 1850.00, true, 'eft', 0),
    (12, 44, 'supplies', 'Cleaning chemicals and sanitiser', 'CleanPro Hygiene', 1260.00, true, 'eft', 1),
    (13, 40, 'marketing', 'Instagram and Facebook ads', 'Meta Ads (demo)', 1500.00, true, 'credit_card', 0),
    (14, 36, 'supplies', 'Milk and oat milk — fortnight', 'Karoo Fresh Dairy', 3290.00, true, 'eft', 4),
    (15, 32, 'utilities', 'Electricity — prepaid units', 'City Power', 5210.00, true, 'debit_card', 0),
    (16, 28, 'other', 'Monthly rent — shop 3', 'Braamfontein Property Trust', 28500.00, false, 'eft', 0),
    (17, 25, 'utilities', 'Fibre internet 100 Mbps', 'Rain Fibre (demo)', 999.00, true, 'debit_card', 0),
    (18, 21, 'supplies', 'Coffee beans — single origin 10kg', 'Highveld Coffee Roasters', 4250.00, true, 'eft', 2),
    (19, 17, 'supplies', 'Beef patties and chicken', 'Metro Butchery', 4680.00, true, 'eft', 5),
    (20, 13, 'marketing', 'Printed menus and loyalty cards', 'QuickPrint Braamfontein', 860.00, true, 'debit_card', 0),
    (21, 10, 'supplies', 'Fresh produce', 'Jozi Market Produce', 2415.00, false, 'cash', 3),
    (22, 6, 'supplies', 'Takeaway cups, lids and boxes', 'PackRight Packaging', 2080.00, true, 'eft', 6),
    (23, 4, 'maintenance', 'Fridge compressor repair', 'CoolTech Refrigeration', 2350.00, true, 'eft', 0),
    (24, 1, 'supplies', 'Milk and oat milk — fortnight', 'Karoo Fresh Dairy', 3355.00, true, 'eft', 4)
  ) AS x(n, ago, category, descr, vendor, amount, vat, method, supplier);

  -- ── Team: fictional staff without logins + payroll ─────────────────────────────────
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"n":1,"name":"Naledi Mokoena","title":"Restaurant Manager","dept":"Management","role":"manager","fn":"general","salary":24000,"start":"2021-03-01"},
    {"n":2,"name":"Sibusiso Khoza","title":"Head Barista","dept":"Front of House","role":"employee","fn":"pos","salary":11500,"start":"2021-06-14"},
    {"n":3,"name":"Ayesha Patel","title":"Cashier","dept":"Front of House","role":"employee","fn":"pos","salary":8200,"start":"2022-02-01"},
    {"n":4,"name":"Lwazi Dube","title":"Waiter","dept":"Front of House","role":"employee","fn":"pos","salary":7500,"start":"2023-01-09"},
    {"n":5,"name":"Refilwe Mahlaba","title":"Waiter","dept":"Front of House","role":"employee","fn":"pos","salary":7500,"start":"2023-08-21"},
    {"n":6,"name":"Kabelo Nkuna","title":"Head Chef","dept":"Kitchen","role":"employee","fn":"operations","salary":16500,"start":"2021-04-12"},
    {"n":7,"name":"Grace Adams","title":"Kitchen Assistant","dept":"Kitchen","role":"employee","fn":"operations","salary":8000,"start":"2024-02-05"}
  ]'::jsonb) LOOP
    INSERT INTO public.memberships (org_id, user_id, role, job_function, employee_number, employment_status,
      employment_start_date, department, job_title, invited_name, invited_email, manager_membership_id, created_at)
    VALUES (p_org, NULL, v_rec ->> 'role', v_rec ->> 'fn', format('EMP-%s', lpad(v_rec ->> 'n', 3, '0')), 'active',
      (v_rec ->> 'start')::date, v_rec ->> 'dept', v_rec ->> 'title', v_rec ->> 'name',
      lower(replace(v_rec ->> 'name', ' ', '.')) || '@mavelacafe.example',
      CASE WHEN (v_rec ->> 'n')::integer > 1 THEN v_manager END,
      v_now - interval '400 days')
    RETURNING id INTO v_member;
    IF (v_rec ->> 'n')::integer = 1 THEN
      v_manager := v_member;
    END IF;

    INSERT INTO public.payroll_profiles (org_id, membership_id, user_id, employee_number, full_name, email, job_title,
      department, employment_status, employment_start_date, pay_frequency, pay_type, base_salary, banking,
      tax_identifiers, payroll_status, notes)
    VALUES (p_org, v_member, NULL, format('EMP-%s', lpad(v_rec ->> 'n', 3, '0')), v_rec ->> 'name',
      lower(replace(v_rec ->> 'name', ' ', '.')) || '@mavelacafe.example', v_rec ->> 'title', v_rec ->> 'dept',
      'active', (v_rec ->> 'start')::date, 'monthly', 'monthly_salary', (v_rec ->> 'salary')::numeric,
      jsonb_build_object('bank_name', 'Demo Bank', 'account_number', 'DEMO-000000000', 'branch_code', '000000'),
      '{}'::jsonb, 'active', 'Demo Mode — fictional employee.');
  END LOOP;

  -- ── POS: native till, register, shifts ────────────────────────────────────────────
  INSERT INTO public.pos_connections (org_id, provider, label, status, config, created_by, created_at, updated_at)
  VALUES (p_org, 'paidly', 'Paidly POS', 'active', '{"connection_method":"native"}'::jsonb, p_owner,
    v_now - interval '120 days', v_now)
  RETURNING id INTO v_conn;

  INSERT INTO public.pos_registers (org_id, name, status, opening_balance, created_by, created_at, updated_at)
  VALUES (p_org, 'Front Counter', 'active', 500, p_owner, v_now - interval '120 days', v_now - interval '120 days')
  RETURNING id INTO v_register;

  -- Yesterday's shift is inserted open and closed after its sales are recorded (closed shifts are immutable).
  INSERT INTO public.pos_register_sessions (org_id, register_id, status, opening_balance, opened_by, opened_at, created_at, updated_at, notes)
  VALUES (p_org, v_register, 'open', 500, p_owner, v_day0 - interval '1 day' + interval '7 hours',
    v_day0 - interval '1 day' + interval '7 hours', v_day0 - interval '1 day' + interval '7 hours', 'Morning shift — Ayesha')
  RETURNING id INTO v_session_closed;

  -- Same 27-day counter history as the per-sale loop, inserted as a set.
  SELECT h.cash_yesterday, h.sale_count
    INTO v_cash_yesterday, v_seq
  FROM public.demo_seed_historical_counter_sales(
    p_org, p_owner, v_conn, v_register, v_session_closed, v_day0, v_counter_menus, v_cashiers
  ) AS h;

  UPDATE public.pos_register_sessions
  SET status = 'closed', cash_sales = v_cash_yesterday, expected_cash = 500 + v_cash_yesterday,
      closing_cash = 500 + v_cash_yesterday, variance = 0, closed_by = p_owner,
      closed_at = v_day0 - interval '1 day' + interval '17 hours 30 minutes',
      updated_at = v_day0 - interval '1 day' + interval '17 hours 30 minutes'
  WHERE id = v_session_closed;

  -- Today's shift stays open so the till is ready to sell.
  INSERT INTO public.pos_register_sessions (org_id, register_id, status, opening_balance, opened_by, opened_at, created_at, updated_at, notes)
  VALUES (p_org, v_register, 'open', 500, p_owner, least(v_now - interval '3 hours', v_day0 + interval '7 hours'),
    least(v_now - interval '3 hours', v_day0 + interval '7 hours'), v_now, 'Morning shift — Sibusiso')
  RETURNING id INTO v_session_open;

  -- ── Restaurant floor ──────────────────────────────────────────────────────────────
  INSERT INTO public.pos_floors (org_id, name, sort_order, created_by) VALUES (p_org, 'Main Floor', 0, p_owner) RETURNING id INTO v_floor_main;
  INSERT INTO public.pos_floors (org_id, name, sort_order, created_by) VALUES (p_org, 'Patio', 1, p_owner) RETURNING id INTO v_floor_patio;

  INSERT INTO public.pos_tables (org_id, floor_id, name, seats, shape, pos_x, pos_y, is_active, cleaning_since, created_by)
  SELECT p_org, CASE WHEN x.n <= 6 THEN v_floor_main ELSE v_floor_patio END, 'Table ' || x.n, x.seats, x.shape, x.px, x.py,
    true, CASE WHEN x.n = 10 THEN v_now - interval '4 minutes' END, p_owner
  FROM (VALUES
    (1, 2, 'round', 1, 1), (2, 2, 'round', 5, 1), (3, 4, 'square', 9, 1),
    (4, 4, 'square', 1, 5), (5, 6, 'long', 5, 5), (6, 4, 'square', 10, 5),
    (7, 2, 'round', 1, 1), (8, 4, 'square', 5, 1), (9, 4, 'square', 9, 1), (10, 6, 'long', 4, 5)
  ) AS x(n, seats, shape, px, py);

  -- Earlier today: four dine-in bills paid and closed, plus counter sales.
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"table":"Table 1","mins":210,"guests":2,"server":"Lwazi Dube","method":"card","items":[["MC-CAP",2],["MC-CRO",2]]},
    {"table":"Table 4","mins":170,"guests":3,"server":"Refilwe Mahlaba","method":"cash","items":[["MC-LAT",2],["MC-AME",1],["MC-MUF",2]]},
    {"table":"Table 7","mins":120,"guests":4,"server":"Lwazi Dube","method":"card","items":[["MC-CHB",2],["MC-CKB",1],["MC-CHP",3],["MC-SFT",4]]},
    {"table":"Table 5","mins":75,"guests":2,"server":"Refilwe Mahlaba","method":"card","items":[["MC-BFW",1],["MC-SAL",1],["MC-WTR",2]]}
  ]'::jsonb) LOOP
    v_order := v_order + 1;
    v_seq := v_seq + 1;
    v_at := v_now - make_interval(mins => (v_rec ->> 'mins')::integer);
    INSERT INTO public.pos_tabs (org_id, register_id, table_id, order_type, order_number, status, guests, server_name,
      opened_at, closed_at, closed_by, created_by, updated_at, register_session_id)
    SELECT p_org, v_register, t.id, 'dine_in', v_order, 'closed', (v_rec ->> 'guests')::integer, v_rec ->> 'server',
      v_at - interval '45 minutes', v_at, p_owner, p_owner, v_at, v_session_open
    FROM public.pos_tables t WHERE t.org_id = p_org AND t.name = v_rec ->> 'table'
    RETURNING id INTO v_tab;

    INSERT INTO public.pos_kitchen_tickets (org_id, tab_id, ticket_number, round, station, status, table_label, order_type,
      server_name, sent_at, accepted_at, ready_at, completed_at, created_by, updated_at)
    VALUES (p_org, v_tab, v_order || '-1', 1, 'kitchen', 'completed', v_rec ->> 'table', 'dine_in', v_rec ->> 'server',
      v_at - interval '40 minutes', v_at - interval '38 minutes', v_at - interval '28 minutes', v_at - interval '25 minutes', p_owner, v_at)
    RETURNING id INTO v_ticket;

    INSERT INTO public.pos_tab_items (org_id, tab_id, product_id, name, quantity, unit_price, station, status, kot_id, round, created_by, created_at, updated_at)
    SELECT p_org, v_tab, s.id, s.name, (e ->> 1)::numeric, s.price, coalesce(s.pos_station, 'kitchen'), 'sent', v_ticket, 1, p_owner,
      v_at - interval '42 minutes', v_at - interval '40 minutes'
    FROM jsonb_array_elements(v_rec -> 'items') e
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0;

    v_sale := public.demo_seed_pos_sale(p_org, p_owner, v_conn, v_register, v_session_open, v_seq, v_at,
      v_rec ->> 'method', v_rec -> 'items', v_rec ->> 'server',
      jsonb_build_object('tab_id', v_tab, 'label', v_rec ->> 'table', 'order_number', v_order));
    IF v_rec ->> 'method' = 'cash' THEN
      SELECT v_cash_today + total_amount INTO v_cash_today FROM public.pos_sales_events WHERE id = v_sale;
    END IF;
  END LOOP;

  FOR v_k IN 1..5 LOOP
    v_seq := v_seq + 1;
    v_items := v_counter_menus -> ((v_k * 4) % jsonb_array_length(v_counter_menus));
    v_method := CASE WHEN v_k % 2 = 0 THEN 'cash' ELSE 'card' END;
    v_sale := public.demo_seed_pos_sale(p_org, p_owner, v_conn, v_register, v_session_open, v_seq,
      v_now - make_interval(mins => 20 + v_k * 31), v_method, v_items, v_cashiers[1 + (v_k % 3)]);
    IF v_method = 'cash' THEN
      SELECT v_cash_today + total_amount INTO v_cash_today FROM public.pos_sales_events WHERE id = v_sale;
    END IF;
  END LOOP;

  UPDATE public.pos_register_sessions
  SET cash_sales = v_cash_today, expected_cash = 500 + v_cash_today, updated_at = v_now
  WHERE id = v_session_open;

  -- ── Live service: one table per floor status + takeaway orders ────────────────────
  -- tickets: [station, status, minutes ago] per round; items: [sku, qty, round] (round 0 = not sent yet).
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"type":"dine_in","table":"Table 2","guests":2,"server":"Lwazi Dube","opened":6,"items":[["MC-CAP",2,0],["MC-CRO",1,0]],"tickets":[]},
    {"type":"dine_in","table":"Table 3","guests":3,"server":"Refilwe Mahlaba","opened":18,"items":[["MC-CHB",1,1],["MC-CKW",1,1],["MC-CHP",2,1]],"tickets":[["kitchen","preparing",9]]},
    {"type":"dine_in","table":"Table 5","guests":2,"server":"Lwazi Dube","opened":26,"items":[["MC-CKB",2,1],["MC-SAL",1,1]],"tickets":[["kitchen","ready",15]]},
    {"type":"dine_in","table":"Table 6","guests":4,"server":"Refilwe Mahlaba","opened":55,"bill":5,"items":[["MC-LAT",2,1],["MC-FLW",2,1],["MC-BFW",2,2],["MC-CHP",2,2]],"tickets":[["bar","completed",48],["kitchen","completed",35]]},
    {"type":"dine_in","table":"Table 8","guests":2,"server":"Lwazi Dube","opened":40,"pay_pending":true,"items":[["MC-FLW",2,1],["MC-CKE",2,1]],"tickets":[["bar","completed",33]]},
    {"type":"dine_in","table":"Table 9","guests":3,"server":"Refilwe Mahlaba","opened":30,"items":[["MC-AME",1,1],["MC-ESP",1,1],["MC-CHB",1,1]],"tickets":[["kitchen","completed",22]]},
    {"type":"takeaway","customer":"Sipho","server":"Ayesha Patel","opened":4,"items":[["MC-CKW",2,1],["MC-ICE",2,1]],"tickets":[["kitchen","new",3]]},
    {"type":"takeaway","customer":"Megan","server":"Ayesha Patel","opened":12,"items":[["MC-MUF",3,1],["MC-CAP",3,1]],"tickets":[["bar","ready",6]]}
  ]'::jsonb) LOOP
    v_order := v_order + 1;
    v_at := v_now - make_interval(mins => (v_rec ->> 'opened')::integer);
    INSERT INTO public.pos_tabs (org_id, register_id, table_id, order_type, order_number, status, guests, server_name,
      customer_name, bill_requested_at, opened_at, created_by, updated_at, register_session_id)
    VALUES (p_org, v_register,
      (SELECT t.id FROM public.pos_tables t WHERE t.org_id = p_org AND t.name = v_rec ->> 'table'),
      v_rec ->> 'type', v_order, 'open', (v_rec ->> 'guests')::integer, v_rec ->> 'server', v_rec ->> 'customer',
      CASE WHEN v_rec ? 'bill' THEN v_now - make_interval(mins => (v_rec ->> 'bill')::integer) END,
      v_at, p_owner, v_now, v_session_open)
    RETURNING id INTO v_tab;

    v_k := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_rec -> 'tickets') LOOP
      v_k := v_k + 1;
      INSERT INTO public.pos_kitchen_tickets (org_id, tab_id, ticket_number, round, station, status, table_label,
        order_type, server_name, sent_at, accepted_at, ready_at, completed_at, created_by, updated_at)
      VALUES (p_org, v_tab, v_order || '-' || v_k, v_k, v_item ->> 0, v_item ->> 1,
        coalesce(v_rec ->> 'table', 'Takeaway #' || v_order), v_rec ->> 'type', v_rec ->> 'server',
        v_now - make_interval(mins => (v_item ->> 2)::integer),
        CASE WHEN v_item ->> 1 <> 'new' THEN v_now - make_interval(mins => (v_item ->> 2)::integer - 1) END,
        CASE WHEN v_item ->> 1 IN ('ready', 'completed') THEN v_now - make_interval(mins => greatest((v_item ->> 2)::integer - 8, 1)) END,
        CASE WHEN v_item ->> 1 = 'completed' THEN v_now - make_interval(mins => greatest((v_item ->> 2)::integer - 10, 1)) END,
        p_owner, v_now);
    END LOOP;

    INSERT INTO public.pos_tab_items (org_id, tab_id, product_id, name, quantity, unit_price, station, status, kot_id, round, created_by, created_at, updated_at)
    SELECT p_org, v_tab, s.id, s.name, (e ->> 1)::numeric, s.price, coalesce(s.pos_station, 'kitchen'),
      CASE WHEN (e ->> 2)::integer = 0 THEN 'pending' ELSE 'sent' END,
      (SELECT kt.id FROM public.pos_kitchen_tickets kt WHERE kt.tab_id = v_tab AND kt.round = (e ->> 2)::integer),
      nullif((e ->> 2)::integer, 0), p_owner, v_at, v_now
    FROM jsonb_array_elements(v_rec -> 'items') e
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0;

    -- Table 8: the guest is paying by (simulated) card right now.
    IF (v_rec ->> 'pay_pending')::boolean THEN
      SELECT coalesce(sum(round(i.unit_price * i.quantity, 2)), 0) INTO v_total FROM public.pos_tab_items i WHERE i.tab_id = v_tab;
      INSERT INTO public.payment_intents (org_id, source_kind, provider, amount, currency, status, idempotency_key,
        created_by, metadata, created_at, updated_at)
      VALUES (p_org, 'pos', 'card_terminal', v_total, 'ZAR', 'requires_action', format('demo-seed-tab-%s', v_order), p_owner,
        jsonb_build_object('origin', 'pos_table', 'settlement', 'terminal', 'payment_method', 'card', 'demo_simulated', true,
          'tab_id', v_tab,
          'next_action', jsonb_build_object('type', 'demo', 'display', 'DEMO PAYMENT', 'demo', true, 'mock', true),
          'checkout', jsonb_build_object(
            'connection_id', v_conn, 'register_id', v_register, 'session_id', v_session_open,
            'items', (SELECT jsonb_agg(jsonb_build_object('product_id', i.product_id, 'line_id', 'tab-' || i.id, 'name', i.name,
                        'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', round(i.unit_price * i.quantity, 2),
                        'sku', '', 'barcode', ''))
                      FROM public.pos_tab_items i WHERE i.tab_id = v_tab),
            'subtotal', v_total, 'discount_amount', 0, 'tax_amount', 0, 'tax_rate', 0, 'payment_method', 'card',
            'currency', 'ZAR', 'cashier_id', p_owner, 'cashier_name', v_rec ->> 'server', 'brand_name', 'Mavela Café',
            'idempotency_key', format('demo-seed-tab-%s', v_order), 'origin', 'pos_table', 'settlement', 'terminal',
            'tab_id', v_tab, 'tab_label', v_rec ->> 'table', 'order_number', v_order, 'bill_label', 'Full bill')),
        v_now - interval '2 minutes', v_now - interval '2 minutes')
      RETURNING id INTO v_intent;
      INSERT INTO public.pos_tab_payments (org_id, tab_id, payment_intent_id, label, split_kind, allocation, created_by, created_at)
      VALUES (p_org, v_tab, v_intent, 'Full bill', 'full', '{}'::jsonb, p_owner, v_now - interval '2 minutes');
    END IF;
  END LOOP;

  -- Two cancelled orders.
  FOR v_rec IN SELECT value FROM jsonb_array_elements('[
    {"type":"takeaway","customer":"Walk-in","mins":150,"reason":"Customer left before order was made","items":[["MC-ICE",1],["MC-MUF",1]]},
    {"type":"dine_in","table":"Table 2","mins":95,"reason":"Order entered on the wrong table","items":[["MC-CHB",2]]}
  ]'::jsonb) LOOP
    v_order := v_order + 1;
    v_at := v_now - make_interval(mins => (v_rec ->> 'mins')::integer);
    INSERT INTO public.pos_tabs (org_id, register_id, table_id, order_type, order_number, status, server_name,
      customer_name, note, opened_at, closed_at, closed_by, created_by, updated_at)
    VALUES (p_org, v_register,
      (SELECT t.id FROM public.pos_tables t WHERE t.org_id = p_org AND t.name = v_rec ->> 'table'),
      v_rec ->> 'type', v_order, 'void', 'Ayesha Patel', v_rec ->> 'customer', v_rec ->> 'reason',
      v_at, v_at + interval '6 minutes', p_owner, p_owner, v_at + interval '6 minutes');
    INSERT INTO public.pos_tab_items (org_id, tab_id, product_id, name, quantity, unit_price, station, status, void_reason, created_by, created_at, updated_at)
    SELECT p_org, t.id, s.id, s.name, (e ->> 1)::numeric, s.price, coalesce(s.pos_station, 'kitchen'), 'void', v_rec ->> 'reason',
      p_owner, v_at, v_at + interval '6 minutes'
    FROM jsonb_array_elements(v_rec -> 'items') e
    JOIN public.services s ON s.org_id = p_org AND s.sku = e ->> 0
    JOIN public.pos_tabs t ON t.org_id = p_org AND t.order_number = v_order;
  END LOOP;

  -- Opening stock: one purchase per product that, net of every recorded sale, lands on today's level.
  INSERT INTO public.inventory_movements (product_id, quantity, type, source, reference_id, created_at)
  SELECT s.id, s.stock_quantity + coalesce(sold.qty, 0), 'in', 'purchase', NULL,
    ((v_day0 - interval '30 days') AT TIME ZONE 'UTC')
  FROM public.services s
  LEFT JOIN (
    SELECT m.product_id, sum(m.quantity) AS qty
    FROM public.inventory_movements m
    JOIN public.services s2 ON s2.id = m.product_id AND s2.org_id = p_org
    WHERE m.type = 'out'
    GROUP BY m.product_id
  ) sold ON sold.product_id = s.id
  WHERE s.org_id = p_org AND s.item_type = 'product';

  -- ── Notifications ─────────────────────────────────────────────────────────────────
  INSERT INTO public.notifications (user_id, message, read, created_at) VALUES
    (p_owner, 'Invoice #INV-1008 has been fully paid.', true, v_now - interval '28 days'),
    (p_owner, 'Quote #QUO-1003 was accepted.', false, v_now - interval '6 days'),
    (p_owner, 'Invoice #INV-1017 was viewed by the client.', false, v_now - interval '5 days'),
    (p_owner, 'Blueberry Muffin is running low (6 left).', false, v_now - interval '2 hours'),
    (p_owner, 'Table 5 order is ready in the kitchen.', false, v_now - interval '15 minutes');

  RETURN jsonb_build_object(
    'clients', (SELECT count(*) FROM public.clients WHERE org_id = p_org),
    'invoices', (SELECT count(*) FROM public.invoices WHERE org_id = p_org),
    'quotes', (SELECT count(*) FROM public.quotes WHERE org_id = p_org),
    'products', (SELECT count(*) FROM public.services WHERE org_id = p_org AND item_type = 'product'),
    'pos_sales', (SELECT count(*) FROM public.pos_sales_events WHERE org_id = p_org)
  );
END;
$$;

-- Business profile shared by provision and reset: org details, owner profile, owner membership.
CREATE OR REPLACE FUNCTION public.demo_apply_business_profile(p_org uuid, p_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.organizations
  SET name = 'Mavela Café',
      industry = 'Restaurant / Café',
      business_type = 'restaurant',
      company_email = 'hello@mavelacafe.example',
      phone = '+27 11 555 0100',
      address = '112 Juta Street, Braamfontein, Johannesburg, 2001, South Africa',
      registration_number = '2019/000000/07',
      tax_info = jsonb_build_object('vat_registered', true, 'vat_number', '4000000000', 'vat_rate', 15, 'country', 'ZA'),
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      email_templates = '{}'::jsonb,
      reminder_settings = '{}'::jsonb,
      is_internal = true
  WHERE id = p_org AND is_demo;

  UPDATE public.profiles
  SET full_name = 'Thabo Mavela',
      first_name = 'Thabo',
      last_name = 'Mavela',
      company_name = 'Mavela Café',
      company_address = '112 Juta Street, Braamfontein, Johannesburg, 2001',
      phone = '+27 11 555 0100',
      currency = 'ZAR',
      timezone = 'Africa/Johannesburg',
      job_title = 'Owner',
      business = coalesce(business, '{}'::jsonb) || jsonb_build_object(
        'onboarding_v2', jsonb_build_object('status', 'completed', 'source', 'demo'),
        'business_type', 'restaurant', 'country', 'ZA', 'vat_registered', true),
      updated_at = now()
  WHERE id = p_owner;

  INSERT INTO public.memberships (org_id, user_id, role, job_function, employee_number, employment_status,
    job_title, department, invited_name, employment_start_date)
  VALUES (p_org, p_owner, 'owner', 'general', 'EMP-000', 'active', 'Owner', 'Management', 'Thabo Mavela', DATE '2019-05-01')
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'owner', disabled_at = NULL, employment_status = 'active';

  PERFORM public.upsert_user_company_role(p_owner, p_org, 'owner', 'admin', NULL);
  PERFORM public.sync_saas_user_roles(p_owner);
END;
$$;

-- Drop the 3-arg signature so the pool flag can be added. Callers that omit it still provision a claimed workspace.
DROP FUNCTION IF EXISTS public.provision_demo_workspace(uuid, integer, text);

CREATE OR REPLACE FUNCTION public.provision_demo_workspace(
  p_user_id uuid,
  p_ttl_minutes integer DEFAULT 120,
  p_client_hash text DEFAULT NULL,
  p_for_pool boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_expires timestamptz := now() + make_interval(mins => greatest(15, least(coalesce(p_ttl_minutes, 120), 1440)));
  v_email text;
  v_seed jsonb;
BEGIN
  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'provision_demo_workspace: unknown user' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organizations o WHERE o.owner_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.demo_sessions d WHERE d.user_id = p_user_id) THEN
    RAISE EXCEPTION 'provision_demo_workspace: user already has a workspace' USING ERRCODE = '42501';
  END IF;

  -- A pooled workspace waits on the shelf. The visitor's TTL starts at claim, not at prepare time.
  IF coalesce(p_for_pool, false) THEN
    v_expires := now() + interval '12 hours';
  END IF;

  INSERT INTO public.demo_sessions (user_id, org_id, expires_at, client_hash, claimed_at)
  VALUES (
    p_user_id, v_org, v_expires, left(p_client_hash, 128),
    CASE WHEN coalesce(p_for_pool, false) THEN NULL ELSE now() END
  );

  INSERT INTO public.organizations (id, name, owner_id, is_demo, demo_expires_at, is_internal, business_type)
  VALUES (v_org, 'Mavela Café', p_user_id, true, v_expires, true, 'restaurant');

  PERFORM public.demo_apply_business_profile(v_org, p_user_id);

  INSERT INTO public.subscriptions (user_id, email, company_id, created_by, status, plan, current_plan, plan_slug,
    plan_family, amount, currency, billing_cycle, trial_started_at, trial_ends_at, subscription_source,
    admin_override, provider, created_at, updated_at)
  VALUES (p_user_id, v_email, v_org, p_user_id, 'trialing', 'growth', 'growth', 'growth_monthly', 'growth', 0, 'ZAR',
    'monthly', now(), v_expires, 'demo', false, 'demo', now(), now());

  v_seed := public.seed_demo_business(v_org, p_user_id);

  RETURN jsonb_build_object('org_id', v_org, 'expires_at', v_expires, 'business_name', 'Mavela Café', 'seed', v_seed);
END;
$$;

-- Atomically hands one prepared workspace to this request. The caller (service role) then rotates the
-- password and signs in. No user id is accepted from the client.
CREATE OR REPLACE FUNCTION public.claim_pooled_demo_workspace(p_ttl_minutes integer, p_client_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.demo_sessions;
  v_expires timestamptz := now() + make_interval(mins => greatest(15, least(coalesce(p_ttl_minutes, 120), 1440)));
  v_email text;
BEGIN
  SELECT * INTO s
  FROM public.demo_sessions d
  WHERE d.claimed_at IS NULL
    AND d.purged_at IS NULL
    AND d.expires_at > now()
  ORDER BY d.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF s.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_demo_org(s.org_id) THEN
    UPDATE public.demo_sessions SET expires_at = now() WHERE user_id = s.user_id;
    RETURN NULL;
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = s.user_id;
  IF v_email IS NULL THEN
    UPDATE public.demo_sessions SET expires_at = now() WHERE user_id = s.user_id;
    RETURN NULL;
  END IF;

  UPDATE public.demo_sessions
  SET claimed_at = now(),
      expires_at = v_expires,
      client_hash = left(p_client_hash, 128)
  WHERE user_id = s.user_id;

  UPDATE public.organizations
  SET demo_expires_at = v_expires
  WHERE id = s.org_id AND is_demo;

  UPDATE public.subscriptions
  SET trial_ends_at = v_expires, updated_at = now()
  WHERE subscription_source = 'demo'
    AND (user_id = s.user_id OR company_id = s.org_id);

  RETURN jsonb_build_object(
    'user_id', s.user_id,
    'email', v_email,
    'org_id', s.org_id,
    'expires_at', v_expires,
    'business_name', 'Mavela Café'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_pool_available_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer
  FROM public.demo_sessions
  WHERE claimed_at IS NULL AND purged_at IS NULL AND expires_at > now();
$$;

REVOKE ALL ON FUNCTION public.provision_demo_workspace(uuid, integer, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_pooled_demo_workspace(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_pool_available_count() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.provision_demo_workspace(uuid, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pooled_demo_workspace(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_pool_available_count() TO service_role;

NOTIFY pgrst, 'reload schema';
