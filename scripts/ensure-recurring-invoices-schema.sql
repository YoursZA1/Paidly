-- Ensure recurring_invoices table exists (match RecurringInvoice_export.csv and user activity)
-- Run in Supabase SQL Editor. Requires public.organizations, public.clients. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.recurring_invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_name text,
  client_id uuid references public.clients(id) on delete set null,
  invoice_template jsonb,
  frequency text not null default 'monthly',
  start_date date,
  end_date date,
  next_generation_date date,
  status text not null default 'active',
  last_generated_invoice_id uuid,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_invoices enable row level security;

drop policy if exists "admin full access recurring_invoices" on public.recurring_invoices;
create policy "admin full access recurring_invoices" on public.recurring_invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org members select recurring_invoices" on public.recurring_invoices;
create policy "org members select recurring_invoices" on public.recurring_invoices
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write recurring_invoices" on public.recurring_invoices;
create policy "org members write recurring_invoices" on public.recurring_invoices
  for insert with check (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members update recurring_invoices" on public.recurring_invoices;
create policy "org members update recurring_invoices" on public.recurring_invoices
  for update using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members delete recurring_invoices" on public.recurring_invoices;
create policy "org members delete recurring_invoices" on public.recurring_invoices
  for delete using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_recurring_invoices_org_id on public.recurring_invoices(org_id);
create index if not exists idx_recurring_invoices_created_at on public.recurring_invoices(created_at desc);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_recurring_invoices_updated_at on public.recurring_invoices;
create trigger update_recurring_invoices_updated_at
  before update on public.recurring_invoices
  for each row
  execute function public.update_updated_at_column();
