-- Ensure invoices, invoice_items, and payments tables exist (fix "Could not find the table 'public.invoices' in the schema cache")
-- Run this entire file in Supabase SQL Editor.
-- If you get errors about "organizations", "clients", or "is_admin", run supabase/schema.postgres.sql first.

create extension if not exists "uuid-ossp";

-- Ensure is_admin() exists (used by RLS policies)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

-- Create invoices table if it does not exist (matches supabase/schema.postgres.sql)
create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text,
  status text not null default 'draft',
  project_title text,
  project_description text,
  invoice_date date,
  delivery_date date,
  delivery_address text,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text default 'USD',
  notes text,
  terms_conditions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  banking_detail_id uuid,
  upfront_payment numeric(12,2),
  milestone_payment numeric(12,2),
  final_payment numeric(12,2),
  milestone_date date,
  final_date date,
  pdf_url text,
  recurring_invoice_id uuid,
  public_share_token text,
  sent_to_email text,
  owner_company_name text,
  owner_company_address text,
  owner_logo_url text,
  owner_email text,
  owner_currency text
);

-- Create invoice_items table if it does not exist
create table if not exists public.invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_name text,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0
);

-- Create payments table if it does not exist
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  paid_at timestamptz,
  method text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure updated_at exists on payments (for existing DBs)
alter table public.payments add column if not exists updated_at timestamptz not null default now();

-- Ensure currency column exists on invoices (for existing DBs)
alter table public.invoices add column if not exists currency text default 'USD';
-- Invoice_export.csv / user activity columns (for existing DBs)
alter table public.invoices add column if not exists banking_detail_id uuid;
alter table public.invoices add column if not exists upfront_payment numeric(12,2);
alter table public.invoices add column if not exists milestone_payment numeric(12,2);
alter table public.invoices add column if not exists final_payment numeric(12,2);
alter table public.invoices add column if not exists milestone_date date;
alter table public.invoices add column if not exists final_date date;
alter table public.invoices add column if not exists pdf_url text;
alter table public.invoices add column if not exists recurring_invoice_id uuid;
alter table public.invoices add column if not exists public_share_token text;
alter table public.invoices add column if not exists sent_to_email text;
alter table public.invoices add column if not exists owner_company_name text;
alter table public.invoices add column if not exists owner_company_address text;
alter table public.invoices add column if not exists owner_logo_url text;
alter table public.invoices add column if not exists owner_email text;
alter table public.invoices add column if not exists owner_currency text;

-- Enable RLS
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

-- Drop and recreate policies (safe to run multiple times)
drop policy if exists "admin full access invoices" on public.invoices;
create policy "admin full access invoices" on public.invoices
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select invoices" on public.invoices;
create policy "org members select invoices" on public.invoices
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write invoices" on public.invoices;
create policy "org members write invoices" on public.invoices
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "admin full access invoice items" on public.invoice_items;
create policy "admin full access invoice items" on public.invoice_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select invoice items" on public.invoice_items;
create policy "org members select invoice items" on public.invoice_items
  for select
  using (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write invoice items" on public.invoice_items;
create policy "org members write invoice items" on public.invoice_items
  for all
  using (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ));

drop policy if exists "admin full access payments" on public.payments;
create policy "admin full access payments" on public.payments
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select payments" on public.payments;
create policy "org members select payments" on public.payments
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write payments" on public.payments;
create policy "org members write payments" on public.payments
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ));

-- Trigger function for updated_at (if not already present)
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_invoices_updated_at on public.invoices;
create trigger update_invoices_updated_at
  before update on public.invoices
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_payments_updated_at on public.payments;
create trigger update_payments_updated_at
  before update on public.payments
  for each row
  execute function public.update_updated_at_column();

-- Optional: indexes for performance (no-op if already exist)
create index if not exists idx_invoices_org_id on public.invoices(org_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_invoice_number on public.invoices(invoice_number);
create index if not exists idx_invoices_created_at on public.invoices(created_at desc);

-- Add invoices to Realtime publication (optional; may fail if already added)
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception when duplicate_object then null;
end $$;

-- Reload PostgREST schema cache so the API sees the new tables (fixes "Could not find the table 'public.invoices' in the schema cache")
notify pgrst, 'reload schema';
