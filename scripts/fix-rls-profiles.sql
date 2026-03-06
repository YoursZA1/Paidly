-- Fix RLS on profiles: ensure users can view and update their own profile.
-- Run this in Supabase SQL Editor if profile data "disappears" after save, logout/login, or on refresh.
-- RLS with no policy = table accepts writes but returns empty on SELECT (auth.uid() must match id).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to see only their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update only their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow users to insert their own profile (needed for upsert when profile doesn't exist yet)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
