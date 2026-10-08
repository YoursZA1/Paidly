-- invoice_items.service_id and quote_items.service_id were added before
-- ON DELETE SET NULL. ADD COLUMN IF NOT EXISTS does not change an existing
-- foreign key, so deleting a catalog item that is already on an invoice fails.
-- Line snapshots (name, quantity, price) stay on the document.

DO $$
DECLARE
  link record;
BEGIN
  FOR link IN
    SELECT *
    FROM (VALUES
      ('invoice_items', 'service_id', 'invoice_items_service_id_fkey'),
      ('invoice_items', 'catalog_item_id', 'invoice_items_catalog_item_id_fkey'),
      ('quote_items', 'service_id', 'quote_items_service_id_fkey'),
      ('quote_items', 'catalog_item_id', 'quote_items_catalog_item_id_fkey')
    ) AS planned(table_name, column_name, constraint_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = link.table_name
        AND column_name = link.column_name
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', link.table_name, link.constraint_name);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.services(id) ON DELETE SET NULL',
        link.table_name,
        link.constraint_name,
        link.column_name
      );
    END IF;
  END LOOP;
END $$;
