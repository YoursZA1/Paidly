-- Product Import (Excel / CSV / PDF → reviewed catalogue rows) (2026-09-30).
--
-- Additive. Imports write to the existing catalogue (public.services) — no new product table.
-- Writes go through POST /api/company/product-import with the caller's own JWT, so the existing
-- "org members write services" RLS policy and the paidly_plan_feature_guard trigger apply unchanged.
--
-- 1. services.import_ref — "{import id}:{source row}" for rows created by an import. Unique per
--    company, so a retried batch (lost response, double tap) can never create the same row twice.
-- 2. Lookup indexes for duplicate detection by SKU and name (barcode already has
--    idx_services_barcode_lower), all leading with org_id.
-- 3. catalog_import_matches() — the company's existing catalogue rows that share a SKU, barcode or
--    name with the rows being imported. SECURITY INVOKER: RLS still decides what the caller sees, and
--    the explicit org filter keeps every lookup inside one company.
--
-- Rollback: DROP FUNCTION public.catalog_import_matches(uuid, text[], text[], text[]);
--           DROP INDEX public.idx_services_org_import_ref, public.idx_services_org_sku_lower,
--                      public.idx_services_org_name_key;
--           ALTER TABLE public.services DROP COLUMN import_ref;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS import_ref text;

COMMENT ON COLUMN public.services.import_ref IS
  'Product Import idempotency key "{import uuid}:{source row}". NULL for items not created by an import.';

-- NULLs never conflict, so ordinary catalogue rows are unaffected. Non-partial on purpose:
-- ON CONFLICT (org_id, import_ref) needs a plain unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_org_import_ref
  ON public.services (org_id, import_ref);

CREATE INDEX IF NOT EXISTS idx_services_org_sku_lower
  ON public.services (org_id, lower(btrim(sku)))
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_services_org_name_key
  ON public.services (org_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

CREATE OR REPLACE FUNCTION public.catalog_import_matches(
  p_org_id uuid,
  p_skus text[],
  p_barcodes text[],
  p_names text[]
)
RETURNS TABLE (
  id uuid,
  name text,
  sku text,
  barcode text,
  item_type text,
  category text,
  description text,
  price numeric,
  cost_price numeric,
  stock_quantity numeric,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  WITH keys AS (
    SELECT
      ARRAY(SELECT DISTINCT lower(btrim(k)) FROM unnest(coalesce(p_skus, '{}'::text[])) AS k
            WHERE btrim(coalesce(k, '')) <> '' LIMIT 2000) AS skus,
      ARRAY(SELECT DISTINCT lower(btrim(k)) FROM unnest(coalesce(p_barcodes, '{}'::text[])) AS k
            WHERE btrim(coalesce(k, '')) <> '' LIMIT 2000) AS barcodes,
      ARRAY(SELECT DISTINCT lower(regexp_replace(btrim(k), '\s+', ' ', 'g')) FROM unnest(coalesce(p_names, '{}'::text[])) AS k
            WHERE btrim(coalesce(k, '')) <> '' LIMIT 2000) AS names
  )
  SELECT s.id, s.name, s.sku, s.barcode, s.item_type, s.category, s.description,
         s.price, s.cost_price, s.stock_quantity::numeric, s.is_active
  FROM public.services s, keys
  WHERE p_org_id IS NOT NULL
    AND s.org_id = p_org_id
    AND (
      (s.sku IS NOT NULL AND lower(btrim(s.sku)) = ANY (keys.skus))
      OR (s.barcode IS NOT NULL AND lower(s.barcode) = ANY (keys.barcodes))
      OR (s.barcode IS NOT NULL AND lower(btrim(s.barcode)) = ANY (keys.barcodes))
      OR lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) = ANY (keys.names)
    )
  LIMIT 6000;
$$;

REVOKE ALL ON FUNCTION public.catalog_import_matches(uuid, text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalog_import_matches(uuid, text[], text[], text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.catalog_import_matches(uuid, text[], text[], text[]) IS
  'Product Import duplicate check: catalogue rows of ONE company sharing a SKU / barcode / name (case- and space-insensitive). SECURITY INVOKER — RLS applies.';
