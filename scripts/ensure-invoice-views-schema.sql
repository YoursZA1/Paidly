-- Ensure invoice_views table exists (match InvoiceView_export.csv and user activity)
-- Run in Supabase SQL Editor. Requires public.organizations, public.invoices, public.clients. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.invoice_views (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  viewed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  is_read boolean default false,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

alter table public.invoice_views enable row level security;

drop policy if exists "admin full access invoice_views" on public.invoice_views;
create policy "admin full access invoice_views" on public.invoice_views
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org members select invoice_views" on public.invoice_views;
create policy "org members select invoice_views" on public.invoice_views
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write invoice_views" on public.invoice_views;
create policy "org members write invoice_views" on public.invoice_views
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_invoice_views_org_id on public.invoice_views(org_id);
create index if not exists idx_invoice_views_invoice_id on public.invoice_views(invoice_id);
create index if not exists idx_invoice_views_viewed_at on public.invoice_views(viewed_at desc);

drop trigger if exists update_invoice_views_updated_at on public.invoice_views;
create trigger update_invoice_views_updated_at
  before update on public.invoice_views
  for each row
  execute function public.update_updated_at_column();
