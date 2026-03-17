-- Core inventory-related schema adjustments
-- 1) services: stock_quantity + type discriminator (product vs service)
-- 2) invoice_items: ensure quantity is integer
-- 3) invoices: ensure core id/status columns exist
-- 4) inventory_movements: create table when missing

-- 1) services: inventory-friendly columns
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

-- Add a high-level type discriminator for inventory semantics.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('product', 'service')) NOT NULL DEFAULT 'service';


-- 2) invoice_items: quantity as integer (schema already has invoice_id and service_name)
ALTER TABLE public.invoice_items
  ALTER COLUMN quantity TYPE integer USING quantity::integer,
  ALTER COLUMN quantity SET NOT NULL,
  ALTER COLUMN quantity SET DEFAULT 1;


-- 3) invoices: ensure id + status exist with expected semantics
ALTER TABLE public.invoices
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS status text;


-- 4) inventory_movements table (if it does not already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
    AND    table_name   = 'inventory_movements'
  ) THEN
    CREATE TABLE public.inventory_movements (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      product_id uuid,
      quantity integer,
      type text,        -- 'in' | 'out'
      source text,      -- e.g. 'invoice'
      reference_id uuid,
      created_at timestamp DEFAULT now()
    );
  END IF;
END$$;

