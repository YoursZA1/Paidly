-- Fix signup: update handle_new_user trigger so it does not require company_address column.
-- Run this in Supabase SQL Editor if new user signup fails with "Database error saving new user"
-- or other schema/trigger errors. Also ensures company_address column exists so the app can save it later from Settings.

alter table public.profiles add column if not exists company_address text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url, logo_url, company_name, company_address, currency, timezone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'logo_url',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'company_address',
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
    currency = coalesce(excluded.currency, profiles.currency),
    timezone = coalesce(excluded.timezone, profiles.timezone),
    updated_at = now();

  insert into public.organizations (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'org_name', 'My Organization'), new.id)
  returning id into new_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

-- Ensure the trigger exists and uses the updated function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
