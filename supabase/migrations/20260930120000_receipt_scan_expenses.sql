-- Scan Receipt → reviewed expense (2026-09-30).
--
-- Additive. Extends public.expenses (no new receipt table) and replaces the receipts bucket's
-- "any org member" storage policies with company- and uploader-scoped ones.
--
-- 1. expenses gains the reviewed receipt fields: supplier_id (same-company only), subtotal, vat_rate,
--    receipt_number, receipt_path (object in the private receipts bucket), receipt_sha256 (duplicate
--    detection), line_items, capture_source, receipt_review (review flags, no receipt contents) and
--    client_operation_id (idempotent confirm: a retried Save returns the same expense).
-- 2. receipt_path must live under the expense's own company folder and can back only one expense.
-- 3. Receipts bucket (was: any member of the org in the first folder could read/update/delete every
--    receipt, POS cashiers included — the bare-member pattern 20260928120000 removed from tables):
--      read    owner/admin/manager of that company: all receipts; other staff: only their own uploads
--      upload  only into {org}/receipts/{own uid}/…, not POS-only staff, company plan includes expenses
--      delete  same as read, and never a receipt an expense still points to
--      update  platform admin only (uploads never upsert)
--    POS-only staff and disabled/revoked members get nothing.

-- ── expenses: reviewed receipt fields ─────────────────────────────────────────────────────────
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2),
  ADD COLUMN IF NOT EXISTS vat_rate numeric(6,3),
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS receipt_sha256 text,
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS capture_source text,
  ADD COLUMN IF NOT EXISTS receipt_review jsonb,
  ADD COLUMN IF NOT EXISTS client_operation_id uuid;

COMMENT ON COLUMN public.expenses.supplier_id IS 'Supplier from the same company (trigger-enforced). NULL = free-text vendor only.';
COMMENT ON COLUMN public.expenses.receipt_path IS 'Object path in the private receipts bucket: {org_id}/receipts/{uploader}/{file}. Read via signed URL.';
COMMENT ON COLUMN public.expenses.receipt_sha256 IS 'SHA-256 of the original receipt file (duplicate detection).';
COMMENT ON COLUMN public.expenses.receipt_review IS 'Review flags from Scan Receipt (VAT check, duplicate warning acknowledged, extraction source). No receipt contents.';
COMMENT ON COLUMN public.expenses.client_operation_id IS 'Idempotency key for Scan Receipt confirm; unique per company.';

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_receipt_path_org_scoped;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_receipt_path_org_scoped
  CHECK (receipt_path IS NULL OR split_part(receipt_path, '/', 1) = org_id::text);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_receipt_sha256_format;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_receipt_sha256_format
  CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_capture_source_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_capture_source_check
  CHECK (capture_source IS NULL OR capture_source IN ('manual', 'receipt_scan', 'csv_import', 'bank_import'));

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_line_items_array;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_line_items_array
  CHECK (line_items IS NULL OR jsonb_typeof(line_items) = 'array');

CREATE UNIQUE INDEX IF NOT EXISTS expenses_org_client_operation_uidx
  ON public.expenses (org_id, client_operation_id) WHERE client_operation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_receipt_path_uidx
  ON public.expenses (receipt_path) WHERE receipt_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_org_receipt_sha256_idx
  ON public.expenses (org_id, receipt_sha256) WHERE receipt_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS expenses_org_date_idx ON public.expenses (org_id, date DESC);

-- A supplier from another company can never be attached (suppliers RLS is manager-only, so this runs
-- as definer to see the row for employee-created expenses too).
CREATE OR REPLACE FUNCTION public.expenses_supplier_same_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers s WHERE s.id = NEW.supplier_id AND s.org_id = NEW.org_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Supplier does not belong to this company';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expenses_supplier_same_org ON public.expenses;
CREATE TRIGGER expenses_supplier_same_org
  BEFORE INSERT OR UPDATE OF supplier_id, org_id ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expenses_supplier_same_org();

-- ── Plan check usable from storage policies ───────────────────────────────────────────────────
-- Same answer as paidly_assert_plan_feature (company plan + access), as a boolean.
CREATE OR REPLACE FUNCTION public.paidly_org_has_feature(p_org uuid, p_feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family text;
  v_access boolean;
BEGIN
  IF auth.uid() IS NULL OR p_org IS NULL THEN
    RETURN false;
  END IF;
  IF coalesce(public.is_admin(), false)
     OR coalesce(current_setting('app.paidly_entitlements_enforce', true), 'on') = 'off' THEN
    RETURN true;
  END IF;
  SELECT p.family, p.has_access INTO v_family, v_access
  FROM public.paidly_company_plan(p_org, auth.uid()) p;
  RETURN coalesce(v_access, false)
    AND public.paidly_family_rank(v_family) >= public.paidly_feature_min_tier(p_feature);
END;
$$;

REVOKE ALL ON FUNCTION public.paidly_org_has_feature(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paidly_org_has_feature(uuid, text) TO authenticated, service_role;

-- ── Receipts bucket access ────────────────────────────────────────────────────────────────────
-- p_mode: 'read' | 'insert' | 'delete'. Parses the path safely (non-uuid folders → false).
CREATE OR REPLACE FUNCTION public.can_access_receipt_object(p_name text, p_mode text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  v_org uuid;
  v_uploader uuid;
BEGIN
  IF auth.uid() IS NULL OR p_name IS NULL OR position('..' IN p_name) > 0 THEN
    RETURN false;
  END IF;
  parts := string_to_array(p_name, '/');
  BEGIN
    v_org := parts[1]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF array_length(parts, 1) = 4 AND parts[2] = 'receipts' THEN
    BEGIN
      v_uploader := parts[3]::uuid;
    EXCEPTION WHEN others THEN
      v_uploader := NULL;
    END;
  END IF;

  IF NOT public.is_org_member(v_org) OR public.is_pos_only_staff_for_org(v_org) THEN
    RETURN false;
  END IF;

  IF p_mode = 'insert' THEN
    RETURN v_uploader IS NOT NULL
      AND v_uploader = auth.uid()
      AND public.paidly_org_has_feature(v_org, 'expenses');
  END IF;

  IF p_mode = 'delete' AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.receipt_path = p_name) THEN
    RETURN false;
  END IF;

  IF p_mode IN ('read', 'delete') THEN
    RETURN public.can_view_org_financials(v_org)
      OR (v_uploader IS NOT NULL AND v_uploader = auth.uid());
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_receipt_object(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_receipt_object(text, text) TO authenticated;

COMMENT ON FUNCTION public.can_access_receipt_object(text, text) IS
  'Receipts bucket RLS: company financial viewers read all of their company''s receipts, other staff only '
  'their own {org}/receipts/{uid}/ uploads; uploads need the expenses plan feature; attached receipts '
  'cannot be deleted. POS-only staff and inactive members: nothing.';

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'receipts';

-- The base schema's catch-alls "org members access assets" (FOR ALL, any member of the first folder)
-- and "admin access storage buckets" also list 'receipts'. Permissive policies OR together, so the
-- member one would void every rule below. Where they exist they are re-created unchanged for the
-- other buckets, without receipts (receipts keep "admin full access receipts"). Where they don't
-- exist, nothing is created.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'org members access assets') THEN
    DROP POLICY "org members access assets" ON storage.objects;
    CREATE POLICY "org members access assets" ON storage.objects
      FOR ALL
      USING (
        bucket_id IN ('paidly', 'profile-logos', 'activities', 'bank-details') AND EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = (SELECT auth.uid())
            AND (storage.foldername(name))[1] = m.org_id::text
        )
      )
      WITH CHECK (
        bucket_id IN ('paidly', 'profile-logos', 'activities', 'bank-details') AND EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = (SELECT auth.uid())
            AND (storage.foldername(name))[1] = m.org_id::text
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
             AND policyname = 'admin access storage buckets') THEN
    DROP POLICY "admin access storage buckets" ON storage.objects;
    CREATE POLICY "admin access storage buckets" ON storage.objects
      FOR ALL
      USING (bucket_id IN ('paidly', 'profile-logos', 'activities', 'bank-details') AND public.is_admin())
      WITH CHECK (bucket_id IN ('paidly', 'profile-logos', 'activities', 'bank-details') AND public.is_admin());
  END IF;
END $$;

DROP POLICY IF EXISTS "org members insert receipts" ON storage.objects;
DROP POLICY IF EXISTS "org members select receipts" ON storage.objects;
DROP POLICY IF EXISTS "org members update receipts" ON storage.objects;
DROP POLICY IF EXISTS "org members delete receipts" ON storage.objects;

DROP POLICY IF EXISTS "company receipts read" ON storage.objects;
CREATE POLICY "company receipts read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.can_access_receipt_object(name, 'read'));

DROP POLICY IF EXISTS "company receipts upload" ON storage.objects;
CREATE POLICY "company receipts upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND public.can_access_receipt_object(name, 'insert'));

DROP POLICY IF EXISTS "company receipts delete" ON storage.objects;
CREATE POLICY "company receipts delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'receipts' AND public.can_access_receipt_object(name, 'delete'));

-- "admin full access receipts" (platform admin) from 20250319000000 is unchanged.

-- Refuse to finish if any other policy (e.g. one created in the dashboard) still names the receipts
-- bucket: it would OR past the rules above and silently reopen every receipt to every member.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname NOT IN ('admin full access receipts', 'company receipts read', 'company receipts upload',
                             'company receipts delete')
      AND (coalesce(qual, '') LIKE '%''receipts''%' OR coalesce(with_check, '') LIKE '%''receipts''%')
  LOOP
    RAISE EXCEPTION 'storage.objects policy "%" also grants access to the receipts bucket; scope it before applying this migration', p.policyname;
  END LOOP;
END $$;
