-- Receipts attached through the Expense form (2026-10-03).
--
-- The Expense form now uploads receipts to the PRIVATE receipts bucket (server-chosen
-- {org}/receipts/{uid}/… path, same as Scan Receipt) instead of the shared `activities` bucket, where every
-- member of the company — POS cashiers included — could read and delete them.
--
-- Those expenses reference the receipt through expenses.receipt_url ("…/object/authenticated/receipts/<path>"),
-- not receipt_path. The delete guard only looked at receipt_path, so the uploader could still delete the
-- receipt behind their own saved expense. A receipt referenced by either column cannot be deleted now.
-- Everything else in can_access_receipt_object is unchanged (20260930120000_receipt_scan_expenses.sql).

CREATE OR REPLACE FUNCTION public.receipt_object_path_from_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    split_part(
      substring(p_url FROM '/storage/v1/object/(?:public|sign|authenticated)/receipts/(.+)$'),
      '?', 1
    ),
    ''
  );
$$;

COMMENT ON FUNCTION public.receipt_object_path_from_url(text) IS
  'Receipts-bucket object path inside a stored receipt URL (mirrors receiptObjectPathFromUrl in shared/expenses/receiptScan.js).';

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

  -- A receipt an expense still points to (scanned: receipt_path; attached in the form: receipt_url).
  IF p_mode = 'delete' AND EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.org_id = v_org
      AND (e.receipt_path = p_name OR public.receipt_object_path_from_url(e.receipt_url) = p_name)
  ) THEN
    RETURN false;
  END IF;

  IF p_mode IN ('read', 'delete') THEN
    RETURN public.can_view_org_financials(v_org)
      OR (v_uploader IS NOT NULL AND v_uploader = auth.uid());
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_access_receipt_object(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_receipt_object(text, text) TO authenticated, service_role;
