-- Atomic, per-org monotonic document numbering (e.g. PO-1001).
-- No existing precedent to reuse: InvoiceNumberGenerator.js generates
-- invoice numbers client-side using a date+initials scheme, not a running
-- counter. Scoped to purchase orders for now; the table is generic
-- (doc_type) so it can be reused later without a schema change.

CREATE TABLE IF NOT EXISTS public.org_document_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, doc_type)
);

ALTER TABLE public.org_document_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin full access org_document_counters" ON public.org_document_counters
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No direct org-member policy: this table is only ever touched via
-- next_document_number(), a SECURITY DEFINER function below.

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_org_id uuid,
  p_doc_type text,
  p_prefix text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF p_org_id IS NULL OR p_doc_type IS NULL OR p_prefix IS NULL THEN
    RAISE EXCEPTION 'org_id, doc_type and prefix are required';
  END IF;

  -- Caller must be a member of the org (or admin) they're requesting a number for.
  IF NOT public.is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.org_id = p_org_id AND m.user_id = (SELECT auth.uid())
  ) THEN
    RAISE EXCEPTION 'not a member of this organization';
  END IF;

  -- First call for an (org, doc_type) inserts starting at 1001 and returns it;
  -- every subsequent call increments and returns the new value.
  INSERT INTO public.org_document_counters (org_id, doc_type, last_number)
  VALUES (p_org_id, p_doc_type, 1001)
  ON CONFLICT (org_id, doc_type)
  DO UPDATE SET last_number = public.org_document_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '-' || v_next::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.next_document_number IS
  'Atomic per-org, per-doc-type monotonic number generator (e.g. PO-1001). SECURITY DEFINER since org_document_counters has no direct member RLS.';
