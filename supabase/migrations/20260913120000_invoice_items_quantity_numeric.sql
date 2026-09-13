-- Commercial invoice/quote lines accept fractional qty (1.25 hours / kg).
-- 20260317211130 cast invoice_items.quantity to integer. The later inventory
-- numeric migration assumed invoice_items was already numeric and never
-- reverted that. Do not truncate 1.25 to 1.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND (
        (c.table_name = 'invoice_items' AND c.column_name = 'quantity')
        OR (c.table_name = 'quote_items' AND c.column_name = 'quantity')
      )
      AND c.data_type IN ('integer', 'smallint', 'bigint')
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(12,2) USING %I::numeric(12,2)',
      r.table_name,
      r.column_name,
      r.column_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT 1',
      r.table_name,
      r.column_name
    );
  END LOOP;
END $$;

COMMENT ON COLUMN public.invoice_items.quantity IS
  'Line quantity. numeric(12,2) so 1.25 hours/kg persist; do not store as integer.';

COMMENT ON COLUMN public.quote_items.quantity IS
  'Line quantity. numeric(12,2) so 1.25 hours/kg persist; do not store as integer.';
