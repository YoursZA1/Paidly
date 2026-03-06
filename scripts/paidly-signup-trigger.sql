-- Paidly signup trigger: copy email and name into profiles the moment a user signs up.
-- Run this in Supabase SQL Editor.
-- For full Paidly onboarding (org + membership), use scripts/fix-signup-trigger.sql instead.

-- 1. Function: copy auth.users data into profiles on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    full_name = excluded.full_name,
    updated_at = now();
  RETURN new;
END;
$$;

-- 2. Trigger: run on every new auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
