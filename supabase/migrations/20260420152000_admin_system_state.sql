-- Backend-enforced system control state for admin danger-zone workflows.

CREATE TABLE IF NOT EXISTS public.admin_system_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  maintenance_mode boolean NOT NULL DEFAULT false,
  last_reset_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reset_reason text
);

ALTER TABLE public.admin_system_state ENABLE ROW LEVEL SECURITY;

-- Seed singleton row.
INSERT INTO public.admin_system_state (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Internal team read.
DROP POLICY IF EXISTS "admin_system_state_select_team" ON public.admin_system_state;
CREATE POLICY "admin_system_state_select_team"
  ON public.admin_system_state FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.profile_role_value(p) IN ('admin', 'management', 'sales', 'support')
    )
  );

-- Admin + management mutate.
DROP POLICY IF EXISTS "admin_system_state_update_management" ON public.admin_system_state;
CREATE POLICY "admin_system_state_update_management"
  ON public.admin_system_state FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.profile_role_value(p) IN ('admin', 'management')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.profile_role_value(p) IN ('admin', 'management')
    )
  );
