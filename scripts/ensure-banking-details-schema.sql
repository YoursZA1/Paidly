-- Ensure banking_details table exists (match BankingDetail_export.csv and user activity)
-- Run in Supabase SQL Editor. Requires public.organizations and auth.users.

create table if not exists public.banking_details (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bank_name text not null,
  account_name text,
  account_number text,
  routing_number text,
  swift_code text,
  payment_method text default 'bank_transfer',
  additional_info text,
  payment_gateway_url text,
  is_default boolean default false,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.banking_details enable row level security;

create policy "admin full access banking_details" on public.banking_details
  for all using (public.is_admin()) with check (public.is_admin());

create policy "org members select banking_details" on public.banking_details
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members write banking_details" on public.banking_details
  for insert with check (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members update banking_details" on public.banking_details
  for update using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members delete banking_details" on public.banking_details
  for delete using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_banking_details_org_id on public.banking_details(org_id);
create index if not exists idx_banking_details_created_at on public.banking_details(created_at desc);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_banking_details_updated_at on public.banking_details;
create trigger update_banking_details_updated_at
  before update on public.banking_details
  for each row
  execute function public.update_updated_at_column();
