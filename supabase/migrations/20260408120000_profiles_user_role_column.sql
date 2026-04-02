-- Client + some RLS helpers reference profiles.user_role; production was missing the column (400 on REST select).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_role text;

UPDATE public.profiles
SET user_role = COALESCE(user_role, role)
WHERE user_role IS NULL AND role IS NOT NULL;

COMMENT ON COLUMN public.profiles.user_role IS 'Staff/app role mirror of role for legacy selects; prefer profiles.role for new code.';
