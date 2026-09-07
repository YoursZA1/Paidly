-- Phase 05: first-class document discount on invoices and quotes.
-- discount_type + discount_value are the user input; discount_amount is the engine result.
-- Historical totals are not rewritten. Legacy negative Discount lines stay in place for display.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.invoices
SET discount_type = 'fixed'
WHERE discount_type IS NULL
   OR discount_type NOT IN ('fixed', 'percentage');

UPDATE public.quotes
SET discount_type = 'fixed'
WHERE discount_type IS NULL
   OR discount_type NOT IN ('fixed', 'percentage');

UPDATE public.invoices
SET discount_value = COALESCE(discount_amount, 0)
WHERE discount_value = 0
  AND COALESCE(discount_amount, 0) > 0
  AND discount_type = 'fixed';

UPDATE public.quotes
SET discount_value = COALESCE(discount_amount, 0)
WHERE discount_value = 0
  AND COALESCE(discount_amount, 0) > 0
  AND discount_type = 'fixed';

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_discount_type_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_discount_type_check
  CHECK (discount_type IN ('fixed', 'percentage'));

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_discount_type_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_discount_type_check
  CHECK (discount_type IN ('fixed', 'percentage'));

COMMENT ON COLUMN public.invoices.discount_type IS
  'fixed or percentage. Engine input; discount_amount is the computed currency amount.';
COMMENT ON COLUMN public.invoices.discount_value IS
  'User-entered discount (R amount or percent). Capped amount is stored in discount_amount.';
COMMENT ON COLUMN public.quotes.discount_type IS
  'fixed or percentage. Copied onto the invoice at quote conversion.';
COMMENT ON COLUMN public.quotes.discount_value IS
  'User-entered discount (R amount or percent).';

-- Converted quotes also lock the new discount input columns.
CREATE OR REPLACE FUNCTION public.enforce_converted_quote_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'converted' OR OLD.converted_at IS NOT NULL THEN
      RAISE EXCEPTION 'converted quotes are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF current_setting('paidly.converting_quote', true) IS DISTINCT FROM '1' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'converted' THEN
      RAISE EXCEPTION 'converted status requires convert_quote_to_invoice';
    END IF;
    IF NEW.converted_at IS DISTINCT FROM OLD.converted_at THEN
      RAISE EXCEPTION 'converted_at requires convert_quote_to_invoice';
    END IF;
  END IF;

  IF OLD.status = 'converted' OR OLD.converted_at IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.converted_at IS DISTINCT FROM OLD.converted_at
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
       OR NEW.discount_type IS DISTINCT FROM OLD.discount_type
       OR NEW.discount_value IS DISTINCT FROM OLD.discount_value
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.quote_number IS DISTINCT FROM OLD.quote_number
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.terms_conditions IS DISTINCT FROM OLD.terms_conditions THEN
      RAISE EXCEPTION 'converted quotes are immutable';
    END IF;
  END IF;
  RETURN NEW;
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
  v_number text;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_now timestamptz := clock_timestamp();
  v_today date := (timezone('utc', now()))::date;
  v_overrides jsonb := COALESCE(p_overrides, '{}'::jsonb);
  v_name text;
  v_line_total numeric;
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
          'service_name', qi.service_name,
          'description', qi.description,
          'quantity', qi.quantity,
          'unit_price', qi.unit_price,
          'total_price', qi.total_price
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
    v_name := lower(btrim(COALESCE(v_item->>'service_name', v_item->>'name', '')));
    v_line_total := COALESCE(
      NULLIF(v_item->>'total_price', '')::numeric,
      NULLIF(v_item->>'total', '')::numeric,
      0
    );
    IF v_name = 'discount' AND v_line_total < 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id,
      service_id,
      service_name,
      description,
      quantity,
      unit_price,
      total_price
    ) VALUES (
      v_invoice.id,
      NULLIF(COALESCE(v_item->>'service_id', v_item->>'catalog_item_id'), '')::uuid,
      COALESCE(NULLIF(v_item->>'service_name', ''), NULLIF(v_item->>'name', ''), 'Item'),
      COALESCE(v_item->>'description', ''),
      COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1),
      COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0),
      v_line_total
    );
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

COMMENT ON FUNCTION public.convert_quote_to_invoice(uuid, jsonb) IS
  'Atomic quote→invoice conversion. Copies header discount fields and skips legacy negative Discount lines.';
