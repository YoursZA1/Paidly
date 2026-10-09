-- Client Import (CSV / Excel / PDF → reviewed public.clients rows) (2026-10-09).
--
-- Additive. Imports write the existing clients table — no second customer database.
-- Writes go through POST /api/company/client-import with the caller's JWT, so the existing
-- clients RLS policies still decide who can insert or update.
--
-- 1. clients.import_ref — "{import uuid}:{source row}" for rows created by an import. Unique per
--    organisation, so a retried batch cannot create the same client twice.
-- 2. client_import_phone_key() — last 9 digits (or 7–8 digits). Same rule as normalizePhone()
--    in shared/clients/clientImport.js.
-- 3. client_import_matches() — this organisation's clients sharing an email, phone key or tax
--    number. Names are not a match. SECURITY DEFINER with its own check (owner / admin / manager of
--    that org, not blocked), which is who RLS lets read every client there. Under RLS the match
--    expressions are not leakproof, so every client row went through the policies one by one.
-- 4. client_import_runs — aggregate history only (filename, who, when, counts). No file bytes
--    and no customer rows. Owner, admin or manager (can_view_org_financials) only, the same people
--    the route lets import. Carries the RESTRICTIVE "inactive members" guard from 20260928140000.
-- 5. Expression indexes so the duplicate lookup does not scan the business's whole client list.
--
-- Rollback: DROP TABLE public.client_import_runs;
--           DROP INDEX public.idx_clients_org_email_key, public.idx_clients_org_phone_key,
--                      public.idx_clients_org_tax_key;
--           DROP FUNCTION public.client_import_matches(uuid, text[], text[], text[]);
--           DROP FUNCTION public.client_import_phone_key(text);
--           DROP INDEX public.idx_clients_org_import_ref;
--           ALTER TABLE public.clients DROP COLUMN import_ref;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS import_ref text;

COMMENT ON COLUMN public.clients.import_ref IS
  'Client Import idempotency key "{import uuid}:{source row}". NULL for clients not created by an import.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_import_ref
  ON public.clients (org_id, import_ref);

CREATE OR REPLACE FUNCTION public.client_import_phone_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN length(digits) >= 9 THEN right(digits, 9)
    WHEN length(digits) >= 7 THEN digits
    ELSE ''
  END
  FROM (SELECT regexp_replace(coalesce(raw, ''), '\D', '', 'g') AS digits) d;
$$;

REVOKE ALL ON FUNCTION public.client_import_phone_key(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_import_phone_key(text) TO authenticated, service_role;

-- Same expressions as client_import_matches(), so its OR branches can use these.
CREATE INDEX IF NOT EXISTS idx_clients_org_email_key
  ON public.clients (org_id, lower(btrim(email)))
  WHERE coalesce(email, '') <> '';
CREATE INDEX IF NOT EXISTS idx_clients_org_phone_key
  ON public.clients (org_id, public.client_import_phone_key(phone))
  WHERE public.client_import_phone_key(phone) <> '';
CREATE INDEX IF NOT EXISTS idx_clients_org_tax_key
  ON public.clients (org_id, lower(regexp_replace(tax_id, '[^a-zA-Z0-9]', '', 'g')))
  WHERE coalesce(tax_id, '') <> '';

CREATE OR REPLACE FUNCTION public.client_import_matches(
  p_org_id uuid,
  p_emails text[],
  p_phones text[],
  p_taxes text[]
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  tax_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Same people the route lets import, and the same rows clients RLS already shows them: the owner,
  -- an admin or a manager of THIS org sees every client in it. Anyone else gets nothing.
  -- IS NOT TRUE / IS NOT FALSE: these helpers return NULL (not false) for someone with no role in the
  -- org. RLS treats NULL as "no"; a plain NOT here would let the call through.
  IF p_org_id IS NULL
     OR auth.uid() IS NULL
     OR public.can_view_org_financials(p_org_id) IS NOT TRUE
     OR public.is_blocked_member_for_org(p_org_id) IS NOT FALSE THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH keys AS (
    SELECT
      ARRAY(SELECT DISTINCT lower(btrim(k)) FROM unnest(coalesce(p_emails, '{}'::text[])) AS k
            WHERE position('@' in coalesce(k, '')) > 0 LIMIT 2000) AS emails,
      ARRAY(SELECT DISTINCT public.client_import_phone_key(k) FROM unnest(coalesce(p_phones, '{}'::text[])) AS k
            WHERE public.client_import_phone_key(k) <> '' LIMIT 2000) AS phones,
      ARRAY(SELECT DISTINCT lower(regexp_replace(coalesce(k, ''), '[^a-zA-Z0-9]', '', 'g'))
            FROM unnest(coalesce(p_taxes, '{}'::text[])) AS k
            WHERE regexp_replace(coalesce(k, ''), '[^a-zA-Z0-9]', '', 'g') <> '' LIMIT 2000) AS taxes
  )
  SELECT c.id, c.name, c.email, c.phone, c.tax_id
  FROM public.clients c, keys
  WHERE c.org_id = p_org_id
    AND (
      (coalesce(c.email, '') <> '' AND lower(btrim(c.email)) = ANY (keys.emails))
      OR (public.client_import_phone_key(c.phone) <> '' AND public.client_import_phone_key(c.phone) = ANY (keys.phones))
      OR (coalesce(c.tax_id, '') <> '' AND lower(regexp_replace(c.tax_id, '[^a-zA-Z0-9]', '', 'g')) = ANY (keys.taxes))
    )
  LIMIT 6000;
END;
$$;

REVOKE ALL ON FUNCTION public.client_import_matches(uuid, text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_import_matches(uuid, text[], text[], text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.client_import_matches(uuid, text[], text[], text[]) IS
  'Client Import duplicate check: clients of ONE organisation sharing an email, phone or tax number. SECURITY DEFINER so the expression indexes are usable (through RLS every client row was filtered one by one); returns nothing unless the caller can_view_org_financials(org) and is not a blocked member, which is exactly who clients RLS lets read every client of that org. Names are not matched.';

CREATE TABLE IF NOT EXISTS public.client_import_runs (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by_id uuid,
  filename text,
  status text NOT NULL DEFAULT 'completed',
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_import_runs_status_check CHECK (status IN ('completed', 'partial', 'failed')),
  CONSTRAINT client_import_runs_counts_check CHECK (
    created_count >= 0 AND updated_count >= 0 AND skipped_count >= 0 AND failed_count >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_client_import_runs_org
  ON public.client_import_runs (org_id, created_at DESC);

COMMENT ON TABLE public.client_import_runs IS
  'Client Import history: filename, user, organisation, status and counts. Does not store the file or customer rows.';

ALTER TABLE public.client_import_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_import_runs_select ON public.client_import_runs;
CREATE POLICY client_import_runs_select
  ON public.client_import_runs FOR SELECT TO authenticated
  USING (public.can_view_org_financials(org_id));

DROP POLICY IF EXISTS client_import_runs_insert ON public.client_import_runs;
CREATE POLICY client_import_runs_insert
  ON public.client_import_runs FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_org_financials(org_id)
    AND created_by_id = auth.uid()
  );

DROP POLICY IF EXISTS client_import_runs_update ON public.client_import_runs;
CREATE POLICY client_import_runs_update
  ON public.client_import_runs FOR UPDATE TO authenticated
  USING (
    public.can_view_org_financials(org_id)
    AND created_by_id = auth.uid()
  )
  WITH CHECK (
    public.can_view_org_financials(org_id)
    AND created_by_id = auth.uid()
  );

-- Same RESTRICTIVE guard every org_id table got in 20260928140000.
DROP POLICY IF EXISTS "inactive members have no org access" ON public.client_import_runs;
CREATE POLICY "inactive members have no org access" ON public.client_import_runs
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_blocked_member_for_org(org_id))
  WITH CHECK (NOT public.is_blocked_member_for_org(org_id));
