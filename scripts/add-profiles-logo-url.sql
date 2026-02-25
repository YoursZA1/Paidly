-- ============================================
-- ADD logo_url TO profiles (fix sync error)
-- ============================================
-- Run this in Supabase SQL Editor if you see:
--   "column profiles.logo_url does not exist"
-- when running admin sync or loading profile data.

-- Add column if it doesn't exist (safe to run multiple times)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url text;

-- Optional: enable Realtime for profiles so profile/logo auto-update in the app (run if not already in publication)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Optional: backfill from user_metadata for existing users (uncomment if needed)
-- UPDATE public.profiles p
-- SET logo_url = u.raw_user_meta_data->>'logo_url'
-- FROM auth.users u
-- WHERE p.id = u.id AND p.logo_url IS NULL AND u.raw_user_meta_data->>'logo_url' IS NOT NULL;
