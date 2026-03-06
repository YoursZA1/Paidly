-- Fix signup: update handle_new_user trigger and ensure profiles table exists
-- Run this in Supabase SQL Editor if new user signup fails with "Database error saving new user"
-- or other schema/trigger errors. Ensures required profile columns exist and row-level security/policy
-- are configured so signup data is captured and users can read their own profile.

-- 1. Make sure the profiles table exists with minimal structure and add any missing columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  email text
);

-- add extra columns used by the app (no-op if already present)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_address text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'starter';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invoice_template text DEFAULT 'classic';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invoice_header text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Enable RLS and provide a simple policy allowing users to read their own record
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can view, update, and insert their own profile (needed for Settings save/upsert)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

alter table public.profiles add column if not exists company_address text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists subscription_plan text default 'starter';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  -- Use a sub-transaction to catch errors if tables/columns are missing
  begin
    insert into public.profiles (id, email, full_name, avatar_url, logo_url, company_name, company_address, phone, subscription_plan, currency, timezone)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'logo_url',
      new.raw_user_meta_data->>'company_name',
      new.raw_user_meta_data->>'company_address',
      new.raw_user_meta_data->>'phone',
      coalesce(new.raw_user_meta_data->>'plan', new.raw_user_meta_data->>'subscription_plan', 'starter'),
      coalesce(new.raw_user_meta_data->>'currency', 'USD'),
      coalesce(new.raw_user_meta_data->>'timezone', 'UTC')
    )
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      logo_url = coalesce(excluded.logo_url, profiles.logo_url),
      company_name = coalesce(excluded.company_name, profiles.company_name),
      company_address = coalesce(excluded.company_address, profiles.company_address),
      phone = coalesce(excluded.phone, profiles.phone),
      subscription_plan = coalesce(excluded.subscription_plan, profiles.subscription_plan),
      currency = coalesce(excluded.currency, profiles.currency),
      timezone = coalesce(excluded.timezone, profiles.timezone),
      updated_at = now();
  exception when others then
    -- Fail silent: the app's updateMyUserData fallback will create/update profile row if missing columns
    raise notice 'Profile creation failed for user %: %', new.id, SQLERRM;
  end;

  begin
    insert into public.organizations (name, owner_id)
    values (coalesce(new.raw_user_meta_data->>'org_name', 'My Organization'), new.id)
    returning id into new_org_id;

    insert into public.memberships (org_id, user_id, role)
    values (new_org_id, new.id, 'owner');
  exception when others then
    -- Fail silent: the app's ensureUserHasOrganization fallback will handle missing org/membership
    raise notice 'Org/Membership creation failed for user %: %', new.id, SQLERRM;
  end;

  return new;
end;
$$;

-- Ensure the trigger exists and uses the updated function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
