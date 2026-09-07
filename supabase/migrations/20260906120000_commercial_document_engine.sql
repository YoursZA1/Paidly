-- Commercial document engine: specialised invoices/quotes only.
-- No dual-write into public.documents.

DO $$
BEGIN
  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION 'public.invoices does not exist.';
  END IF;
  IF to_regclass('public.quotes') IS NULL THEN
    RAISE EXCEPTION 'public.quotes does not exist.';
  END IF;
  IF to_regclass('public.invoice_items') IS NULL THEN
    RAISE EXCEPTION 'public.invoice_items does not exist.';
  END IF;
  IF to_regclass('public.quote_items') IS NULL THEN
    RAISE EXCEPTION 'public.quote_items does not exist.';
  END IF;
END $$;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id);

CREATE INDEX IF NOT EXISTS quote_items_service_id_idx
  ON public.quote_items (service_id)
  WHERE service_id IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoices.discount_amount IS
  'Header discount. Totals tax (subtotal - discount_amount). Legacy negative Discount lines are ignored when this is set.';

COMMENT ON COLUMN public.quotes.discount_amount IS
  'Header discount. Totals tax (subtotal - discount_amount).';

-- Repair duplicate invoice/quote numbers before unique indexes.
UPDATE public.invoices i
SET invoice_number = i.invoice_number || '-DUP-' || substr(replace(i.id::text, '-', ''), 1, 8)
WHERE i.invoice_number IS NOT NULL
  AND length(trim(i.invoice_number)) > 0
  AND i.id IN (
    SELECT d.id
    FROM (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY org_id, trim(invoice_number)
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.invoices
      WHERE invoice_number IS NOT NULL
        AND length(trim(invoice_number)) > 0
    ) d
    WHERE d.rn > 1
  );

UPDATE public.quotes q
SET quote_number = q.quote_number || '-DUP-' || substr(replace(q.id::text, '-', ''), 1, 8)
WHERE q.quote_number IS NOT NULL
  AND length(trim(q.quote_number)) > 0
  AND q.id IN (
    SELECT d.id
    FROM (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY org_id, trim(quote_number)
          ORDER BY created_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM public.quotes
      WHERE quote_number IS NOT NULL
        AND length(trim(quote_number)) > 0
    ) d
    WHERE d.rn > 1
  );

-- Backfill header discount from a single leftover synthetic Discount line.
UPDATE public.invoices i
SET discount_amount = abs(d.total_price)
FROM (
  SELECT invoice_id, min(total_price) AS total_price
  FROM public.invoice_items
  WHERE service_name = 'Discount'
    AND total_price < 0
  GROUP BY invoice_id
  HAVING count(*) = 1
) d
WHERE i.id = d.invoice_id
  AND i.discount_amount = 0;

UPDATE public.quotes q
SET discount_amount = abs(d.total_price)
FROM (
  SELECT quote_id, min(total_price) AS total_price
  FROM public.quote_items
  WHERE service_name = 'Discount'
    AND total_price < 0
  GROUP BY quote_id
  HAVING count(*) = 1
) d
WHERE q.id = d.quote_id
  AND q.discount_amount = 0;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_invoice_number_uidx
  ON public.invoices (org_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND length(trim(invoice_number)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_org_quote_number_uidx
  ON public.quotes (org_id, quote_number)
  WHERE quote_number IS NOT NULL AND length(trim(quote_number)) > 0;

-- Seed counters so next_document_number does not collide with existing INV-N / QUO-N.
INSERT INTO public.org_document_counters (org_id, doc_type, last_number)
SELECT
  i.org_id,
  'invoice',
  GREATEST(
    1000,
    COALESCE(
      MAX(
        CASE
          WHEN i.invoice_number ~ '^INV-[0-9]+$'
          THEN substring(i.invoice_number from 5)::integer
        END
      ),
      1000
    )
  )
FROM public.invoices i
GROUP BY i.org_id
ON CONFLICT (org_id, doc_type) DO UPDATE
SET last_number = GREATEST(public.org_document_counters.last_number, EXCLUDED.last_number);

INSERT INTO public.org_document_counters (org_id, doc_type, last_number)
SELECT
  q.org_id,
  'quote',
  GREATEST(
    1000,
    COALESCE(
      MAX(
        CASE
          WHEN q.quote_number ~ '^QUO-[0-9]+$'
          THEN substring(q.quote_number from 5)::integer
        END
      ),
      1000
    )
  )
FROM public.quotes q
GROUP BY q.org_id
ON CONFLICT (org_id, doc_type) DO UPDATE
SET last_number = GREATEST(public.org_document_counters.last_number, EXCLUDED.last_number);
