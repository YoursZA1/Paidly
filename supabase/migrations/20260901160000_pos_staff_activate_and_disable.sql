-- POS staff: disable membership without deleting identity.
-- Invite acceptance still uses Auth + memberships (no second staff table).
--
-- SQL Editor: 42P01 on memberships means this project never got the identity
-- schema. organizations must already exist (supabase/schema.postgres.sql).

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION
      'auth.users does not exist. Run this in the Paidly Supabase SQL Editor, not a blank Postgres.';
  END IF;

  IF to_regclass('public.organizations') IS NULL THEN
    RAISE EXCEPTION
      'public.organizations does not exist. Apply supabase/schema.postgres.sql in this project first (creates organizations + memberships), then re-run this file.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS job_function text NOT NULL DEFAULT 'general';

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS pos_register_id uuid;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

COMMENT ON COLUMN public.memberships.disabled_at IS
  'When set, POS and company APIs reject this membership. Invitation status is separate.';

CREATE INDEX IF NOT EXISTS idx_memberships_user_disabled
  ON public.memberships (user_id)
  WHERE disabled_at IS NULL;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.memberships TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy pol
    JOIN pg_class rel ON rel.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'memberships'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "memberships org access" ON public.memberships
        FOR SELECT
        USING (
          memberships.user_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = memberships.org_id AND o.owner_id = (SELECT auth.uid())
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "memberships owner manage" ON public.memberships
        FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = memberships.org_id AND o.owner_id = (SELECT auth.uid())
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.organizations o
            WHERE o.id = memberships.org_id AND o.owner_id = (SELECT auth.uid())
          )
        )
    $policy$;
  END IF;
END $$;
