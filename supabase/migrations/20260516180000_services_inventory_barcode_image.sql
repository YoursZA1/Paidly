-- Inventory product fields on catalog (services.item_type = 'product')
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS stock_capacity numeric(12, 2);

COMMENT ON COLUMN public.services.barcode IS 'Scannable barcode (EAN/UPC/custom); distinct from SKU when needed.';
COMMENT ON COLUMN public.services.image_url IS 'Storage path or URL for product image (paidly bucket: inventory/…).';
COMMENT ON COLUMN public.services.stock_capacity IS 'Optional shelf/capacity max for quantity display (e.g. 51/100).';

CREATE INDEX IF NOT EXISTS idx_services_barcode_lower
  ON public.services (org_id, lower(barcode))
  WHERE barcode IS NOT NULL AND item_type = 'product';

