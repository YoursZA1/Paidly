-- Active products in one organisation cannot share a barcode.
-- Compare as text (lower(btrim(...))) so leading zeros stay distinct. No store_id in Paidly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_services_org_active_barcode_unique'
  ) THEN
    BEGIN
      EXECUTE $idx$
        CREATE UNIQUE INDEX idx_services_org_active_barcode_unique
          ON public.services (org_id, lower(btrim(barcode)))
          WHERE barcode IS NOT NULL
            AND btrim(barcode) <> ''
            AND item_type = 'product'
            AND COALESCE(is_active, true)
      $idx$;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'idx_services_org_active_barcode_unique skipped: duplicate active barcodes exist';
    END;
  END IF;
END $$;
