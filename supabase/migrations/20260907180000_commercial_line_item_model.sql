-- Commercial line-item model on specialised invoice_items / quote_items.
-- Additive only: existing rows keep NULL on new columns. No rewrite of historical amounts.

DO $$
BEGIN
  IF to_regclass('public.invoice_items') IS NULL THEN
    RAISE EXCEPTION 'public.invoice_items does not exist.';
  END IF;
  IF to_regclass('public.quote_items') IS NULL THEN
    RAISE EXCEPTION 'public.quote_items does not exist.';
  END IF;
END $$;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,2),
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS unit_type text;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_item_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(6,2),
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS unit_type text;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_item_type_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_item_type_check
  CHECK (item_type IS NULL OR item_type IN ('service', 'product', 'labor', 'material', 'expense'));

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_item_type_check;
ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_item_type_check
  CHECK (item_type IS NULL OR item_type IN ('service', 'product', 'labor', 'material', 'expense'));

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_discount_type_check;
ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('fixed', 'percentage'));

ALTER TABLE public.quote_items
  DROP CONSTRAINT IF EXISTS quote_items_discount_type_check;
ALTER TABLE public.quote_items
  ADD CONSTRAINT quote_items_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('fixed', 'percentage'));

CREATE INDEX IF NOT EXISTS invoice_items_service_id_idx
  ON public.invoice_items (service_id)
  WHERE service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_items_catalog_item_id_idx
  ON public.invoice_items (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_items_service_id_idx
  ON public.quote_items (service_id)
  WHERE service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS quote_items_catalog_item_id_idx
  ON public.quote_items (catalog_item_id)
  WHERE catalog_item_id IS NOT NULL;

COMMENT ON COLUMN public.invoice_items.catalog_item_id IS
  'Catalog/services.id snapshot reference. Industry presets are not stored.';
COMMENT ON COLUMN public.quote_items.catalog_item_id IS
  'Catalog/services.id snapshot reference. Industry presets are not stored.';
COMMENT ON COLUMN public.invoice_items.service_id IS
  'Inventory/catalog services.id used by paid-invoice stock triggers.';

CREATE OR REPLACE FUNCTION public.insert_commercial_invoice_item(p_invoice_id uuid, p_item jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_name text;
  v_total numeric;
  v_item_type text;
  v_discount_type text;
  v_discount numeric;
BEGIN
  v_name := lower(btrim(COALESCE(p_item->>'service_name', p_item->>'name', '')));
  v_total := COALESCE(
    NULLIF(p_item->>'total_price', '')::numeric,
    NULLIF(p_item->>'total', '')::numeric,
    0
  );
  IF v_name = 'discount' AND v_total < 0 THEN
    RETURN;
  END IF;

  v_item_type := lower(btrim(COALESCE(p_item->>'item_type', '')));
  IF v_item_type = 'labour' THEN
    v_item_type := 'labor';
  ELSIF v_item_type IN ('goods', 'inventory') THEN
    v_item_type := 'product';
  END IF;
  IF v_item_type NOT IN ('service', 'product', 'labor', 'material', 'expense') THEN
    v_item_type := NULL;
  END IF;

  v_discount_type := lower(btrim(COALESCE(p_item->>'discount_type', '')));
  IF v_discount_type = 'percent' THEN
    v_discount_type := 'percentage';
  END IF;
  IF v_discount_type NOT IN ('fixed', 'percentage') THEN
    v_discount_type := NULL;
  END IF;

  v_discount := NULLIF(COALESCE(p_item->>'discount', p_item->>'line_discount'), '')::numeric;
  IF v_discount IS NOT NULL AND v_discount <= 0 THEN
    v_discount := NULL;
    v_discount_type := NULL;
  END IF;
  IF v_discount IS NOT NULL AND v_discount_type IS NULL THEN
    v_discount_type := 'fixed';
  END IF;

  INSERT INTO public.invoice_items (
    invoice_id,
    service_id,
    catalog_item_id,
    service_name,
    description,
    quantity,
    unit_price,
    total_price,
    discount,
    discount_type,
    tax_rate,
    sku,
    item_type,
    unit_type
  ) VALUES (
    p_invoice_id,
    NULLIF(btrim(COALESCE(p_item->>'service_id', '')), '')::uuid,
    NULLIF(btrim(COALESCE(p_item->>'catalog_item_id', '')), '')::uuid,
    COALESCE(NULLIF(p_item->>'service_name', ''), NULLIF(p_item->>'name', ''), 'Item'),
    COALESCE(p_item->>'description', ''),
    COALESCE(NULLIF(p_item->>'quantity', '')::numeric, 1),
    COALESCE(NULLIF(p_item->>'unit_price', '')::numeric, 0),
    v_total,
    v_discount,
    v_discount_type,
    NULLIF(COALESCE(p_item->>'tax_rate', p_item->>'item_tax_rate'), '')::numeric,
    NULLIF(left(btrim(COALESCE(p_item->>'sku', p_item->>'part_number', '')), 80), ''),
    v_item_type,
    NULLIF(left(btrim(COALESCE(p_item->>'unit_type', p_item->>'unit', '')), 40), '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.convert_quote_to_invoice(
  p_quote_id uuid,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_quote public.quotes%ROWTYPE;
  v_existing public.invoices%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_items jsonb;
  v_item jsonb;
  v_number text;
  v_now timestamptz := timezone('utc', now());
  v_today date := (timezone('utc', now()))::date;
  v_overrides jsonb := COALESCE(p_overrides, '{}'::jsonb);
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF to_regprocedure('public.is_pos_only_staff()') IS NOT NULL
     AND public.is_pos_only_staff() THEN
    RAISE EXCEPTION 'POS staff cannot convert quotes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_admin()
     AND NOT public.can_read_org_financial_row(v_quote.org_id, v_quote.user_id, v_quote.created_by, NULL) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_quote.org_id IS NULL THEN
    RAISE EXCEPTION 'quote is missing org_id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.invoices
  WHERE source_quote_id = p_quote_id;

  IF FOUND THEN
    IF v_quote.status IS DISTINCT FROM 'converted' OR v_quote.converted_at IS NULL THEN
      PERFORM set_config('paidly.converting_quote', '1', true);
      UPDATE public.quotes
      SET status = 'converted',
          converted_at = COALESCE(converted_at, v_now),
          updated_at = v_now
      WHERE id = p_quote_id;
    END IF;
    RETURN jsonb_build_object(
      'already_converted', true,
      'invoice_id', v_existing.id,
      'invoice_number', v_existing.invoice_number
    );
  END IF;

  IF v_quote.status IN ('declined', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'quote cannot be converted' USING ERRCODE = '22023';
  END IF;

  IF v_quote.status = 'converted' OR v_quote.converted_at IS NOT NULL THEN
    RAISE EXCEPTION 'quote already converted' USING ERRCODE = '22023';
  END IF;

  v_number := public.next_document_number(v_quote.org_id, 'invoice', 'INV');

  INSERT INTO public.invoices (
    org_id,
    client_id,
    company_id,
    invoice_number,
    status,
    project_title,
    project_description,
    invoice_date,
    delivery_date,
    subtotal,
    tax_rate,
    tax_amount,
    discount_type,
    discount_value,
    discount_amount,
    total_amount,
    currency,
    notes,
    terms_conditions,
    created_by,
    user_id,
    banking_detail_id,
    owner_company_name,
    owner_company_address,
    owner_logo_url,
    owner_email,
    owner_currency,
    document_brand_primary,
    document_brand_secondary,
    source_quote_id
  ) VALUES (
    v_quote.org_id,
    COALESCE(NULLIF(v_overrides->>'client_id', '')::uuid, v_quote.client_id),
    NULLIF(v_overrides->>'company_id', '')::uuid,
    v_number,
    'draft',
    COALESCE(
      NULLIF(v_overrides->>'project_title', ''),
      CASE
        WHEN v_quote.project_title IS NOT NULL AND btrim(v_quote.project_title) <> ''
          THEN 'Invoice — ' || v_quote.project_title
        ELSE 'Invoice from ' || COALESCE(v_quote.quote_number, 'quote')
      END
    ),
    COALESCE(NULLIF(v_overrides->>'project_description', ''), v_quote.project_description),
    COALESCE(NULLIF(v_overrides->>'invoice_date', '')::date, v_today),
    COALESCE(
      NULLIF(v_overrides->>'delivery_date', '')::date,
      v_quote.valid_until,
      v_today
    ),
    COALESCE(NULLIF(v_overrides->>'subtotal', '')::numeric, v_quote.subtotal),
    COALESCE(NULLIF(v_overrides->>'tax_rate', '')::numeric, v_quote.tax_rate),
    COALESCE(NULLIF(v_overrides->>'tax_amount', '')::numeric, v_quote.tax_amount),
    COALESCE(NULLIF(v_overrides->>'discount_type', ''), v_quote.discount_type, 'fixed'),
    COALESCE(NULLIF(v_overrides->>'discount_value', '')::numeric, v_quote.discount_value, 0),
    COALESCE(NULLIF(v_overrides->>'discount_amount', '')::numeric, v_quote.discount_amount, 0),
    COALESCE(NULLIF(v_overrides->>'total_amount', '')::numeric, v_quote.total_amount),
    COALESCE(NULLIF(v_overrides->>'currency', ''), v_quote.currency, 'ZAR'),
    COALESCE(NULLIF(v_overrides->>'notes', ''), v_quote.notes),
    COALESCE(NULLIF(v_overrides->>'terms_conditions', ''), v_quote.terms_conditions),
    v_uid,
    v_uid,
    COALESCE(NULLIF(v_overrides->>'banking_detail_id', '')::uuid, v_quote.banking_detail_id),
    COALESCE(NULLIF(v_overrides->>'owner_company_name', ''), v_quote.owner_company_name),
    COALESCE(NULLIF(v_overrides->>'owner_company_address', ''), v_quote.owner_company_address),
    COALESCE(NULLIF(v_overrides->>'owner_logo_url', ''), v_quote.owner_logo_url),
    COALESCE(NULLIF(v_overrides->>'owner_email', ''), v_quote.owner_email),
    COALESCE(NULLIF(v_overrides->>'owner_currency', ''), v_quote.owner_currency, v_quote.currency),
    COALESCE(NULLIF(v_overrides->>'document_brand_primary', ''), v_quote.document_brand_primary),
    COALESCE(NULLIF(v_overrides->>'document_brand_secondary', ''), v_quote.document_brand_secondary),
    p_quote_id
  )
  RETURNING * INTO v_invoice;

  IF v_overrides ? 'items' AND jsonb_typeof(v_overrides->'items') = 'array' THEN
    v_items := v_overrides->'items';
  ELSE
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'service_id', qi.service_id,
          'catalog_item_id', qi.catalog_item_id,
          'service_name', qi.service_name,
          'description', qi.description,
          'quantity', qi.quantity,
          'unit_price', qi.unit_price,
          'total_price', qi.total_price,
          'discount', qi.discount,
          'discount_type', qi.discount_type,
          'tax_rate', qi.tax_rate,
          'sku', qi.sku,
          'item_type', qi.item_type,
          'unit_type', qi.unit_type
        )
        ORDER BY qi.id
      ),
      '[]'::jsonb
    )
    INTO v_items
    FROM public.quote_items qi
    WHERE qi.quote_id = p_quote_id
      AND NOT (
        lower(btrim(COALESCE(qi.service_name, ''))) = 'discount'
        AND qi.total_price < 0
      );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) AS t(value)
  LOOP
    PERFORM public.insert_commercial_invoice_item(v_invoice.id, v_item);
  END LOOP;

  PERFORM set_config('paidly.converting_quote', '1', true);
  UPDATE public.quotes
  SET status = 'converted',
      converted_at = v_now,
      updated_at = v_now
  WHERE id = p_quote_id;

  RETURN jsonb_build_object(
    'already_converted', false,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.invoices
    WHERE source_quote_id = p_quote_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object(
      'already_converted', true,
      'invoice_id', v_existing.id,
      'invoice_number', v_existing.invoice_number
    );
END;
$$;

-- Nested callers of insert_commercial_invoice_item (convert_quote_to_invoice)
-- fail after REVOKE FROM PUBLIC unless EXECUTE is granted — same pattern as
-- apply_inventory_movement in 20260804120000.
REVOKE ALL ON FUNCTION public.insert_commercial_invoice_item(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_commercial_invoice_item(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.convert_quote_to_invoice(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_quote_to_invoice(uuid, jsonb) TO authenticated;
