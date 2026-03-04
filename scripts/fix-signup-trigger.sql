-- Fix signup: Robust handle_new_user trigger with graceful metadata handling.
-- Run this in Supabase SQL Editor if new user signup fails with "Database error saving new user"
-- or other schema/trigger errors. Handles missing or incomplete signup metadata.

alter table public.profiles add column if not exists company_address text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_full_name text;
  user_company_name text;
begin
  -- Extract metadata with safe defaults (handle nulls and empty strings)
  user_full_name := coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), new.email);
  user_company_name := coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'My Company');

  -- Insert profile; if user exists (conflict), update fields
  insert into public.profiles (id, email, full_name, avatar_url, logo_url, company_name, company_address, currency, timezone)
  values (
    new.id,
    new.email,
    user_full_name,
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'logo_url',
    user_company_name,
    coalesce(nullif(new.raw_user_meta_data->>'company_address', ''), ''),
    coalesce(nullif(new.raw_user_meta_data->>'currency', ''), 'USD'),
    coalesce(nullif(new.raw_user_meta_data->>'timezone', ''), 'UTC')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name),
    avatar_url = excluded.avatar_url,
    logo_url = coalesce(excluded.logo_url, profiles.logo_url),
    company_name = coalesce(nullif(excluded.company_name, ''), profiles.company_name),
    company_address = coalesce(nullif(excluded.company_address, ''), profiles.company_address),
    currency = coalesce(nullif(excluded.currency, ''), profiles.currency),
    timezone = coalesce(nullif(excluded.timezone, ''), profiles.timezone),
    updated_at = now();

  -- Create org for user (with safe naming)
  insert into public.organizations (name, owner_id)
  values (user_company_name, new.id)
  returning id into new_org_id;

  -- Add user to org as owner (use on conflict do nothing to prevent duplicate errors)
  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner')
  on conflict do nothing;

  return new;
end;
$$;

-- Ensure the trigger exists and uses the updated function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
