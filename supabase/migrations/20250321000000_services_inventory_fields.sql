-- Services inventory & product-only fields
-- NOTE: This migration assumes `public.services` already exists.

-- 1) Introduce a strict `type` discriminator.
-- If you already have `item_type`, this is a more formal enum-ish text column.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('product', 'service')) NOT NULL DEFAULT 'service';

-- 2) Product-only inventory fields.
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS stock_quantity integer,
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5;

-- 3) Enforce inventory only for products.
--   - For `product` rows: stock_quantity MAY be null initially (e.g. not yet stocked),
--     but must never be set for `service` rows.
--   - You can tighten this later to require stock_quantity IS NOT NULL for products
--     once all existing data is cleaned.
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS product_stock_only;

ALTER TABLE public.services
  ADD CONSTRAINT product_stock_only CHECK (
    (type = 'service' AND stock_quantity IS NULL)
    OR
    (type = 'product')
  );

