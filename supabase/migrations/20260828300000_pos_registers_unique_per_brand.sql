-- Register names are unique per organization + brand, not org-wide.
-- Opening Settings used to auto-insert "Main till", so creating "Main Till"
-- for another brand (or the same brand) hit idx_pos_registers_org_name.

DROP INDEX IF EXISTS public.idx_pos_registers_org_name;

-- COALESCE so two brandless tills cannot share a name (NULL ≠ NULL in unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_registers_org_brand_name
  ON public.pos_registers (
    org_id,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

COMMENT ON INDEX public.idx_pos_registers_org_brand_name IS
  'One till name per org brand. Different brands may both use Main till.';
