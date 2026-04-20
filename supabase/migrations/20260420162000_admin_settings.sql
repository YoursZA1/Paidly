-- Backend-authoritative admin settings store.
-- Replaces browser-local settings as the source of truth for Admin V2 settings.

CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_settings_select_team" ON public.admin_settings;
CREATE POLICY "admin_settings_select_team"
  ON public.admin_settings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND public.profile_role_value(p) IN ('admin', 'management', 'sales', 'support')
    )
  );

DROP POLICY IF EXISTS "admin_settings_mutate_management" ON public.admin_settings;
CREATE POLICY "admin_settings_mutate_management"
  ON public.admin_settings FOR ALL TO authenticated
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

CREATE INDEX IF NOT EXISTS admin_settings_updated_at_idx ON public.admin_settings (updated_at DESC);
