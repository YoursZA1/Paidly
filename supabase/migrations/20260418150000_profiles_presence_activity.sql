-- Real-time user activity telemetry for admin behavior monitoring.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_active_path text;

COMMENT ON COLUMN public.profiles.last_active_at IS
  'Last heartbeat timestamp from authenticated app session (UTC).';
COMMENT ON COLUMN public.profiles.last_active_path IS
  'Last known in-app route path sent by client heartbeat.';

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
  ON public.profiles(last_active_at DESC);
