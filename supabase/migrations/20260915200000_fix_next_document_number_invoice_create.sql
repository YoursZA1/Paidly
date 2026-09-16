-- Invoice/quote create calls next_document_number from the browser (INV-N / QUO-N).
-- PostgREST 403 here is almost always missing EXECUTE or the SECURITY DEFINER
-- insert hitting org_document_counters RLS (admin-only policy, no member write).
-- Org owners resolve org_id from organizations.owner_id and may not have a
-- memberships row, so the member-only check also blocked numbering.

CREATE OR REPLACE FUNCTION public.next_document_number(
  p_org_id uuid,
  p_doc_type text,
  p_prefix text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_next integer;
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF p_org_id IS NULL OR p_doc_type IS NULL OR p_prefix IS NULL THEN
    RAISE EXCEPTION 'org_id, doc_type and prefix are required';
  END IF;

  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND NOT public.is_admin()
     AND NOT public.is_org_member(p_org_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.organizations o
       WHERE o.id = p_org_id
         AND o.owner_id = v_uid
     )
  THEN
    RAISE EXCEPTION 'not a member of this organization';
  END IF;

  INSERT INTO public.org_document_counters (org_id, doc_type, last_number)
  VALUES (p_org_id, p_doc_type, 1001)
  ON CONFLICT (org_id, doc_type)
  DO UPDATE SET last_number = public.org_document_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '-' || v_next::text;
END;
$$;

COMMENT ON FUNCTION public.next_document_number(uuid, text, text) IS
  'Atomic per-org, per-doc-type number (INV-1001). SECURITY DEFINER bypasses counter RLS; callers must be org owner, member, admin, or service_role.';

REVOKE ALL ON FUNCTION public.next_document_number(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_org_company_id(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_commercial_document_issuer() TO authenticated, service_role;

GRANT USAGE ON SCHEMA public TO authenticated;

-- Owners are resolved from organizations.owner_id; numbering and invoice RLS
-- also look at memberships. Backfill any missing owner membership rows.
INSERT INTO public.memberships (org_id, user_id, role)
SELECT o.id, o.owner_id, 'owner'
FROM public.organizations o
WHERE o.owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = o.id
      AND m.user_id = o.owner_id
  );

NOTIFY pgrst, 'reload schema';
