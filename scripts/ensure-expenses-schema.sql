-- Ensure expenses table exists (match Expense_export.csv and user activity). Expense entity uses this table.
-- Run in Supabase SQL Editor. Requires public.organizations. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.expenses (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_number text,
  category text,
  description text,
  amount numeric(12,2) not null default 0,
  date date not null default (current_date),
  payment_method text,
  vendor text,
  receipt_url text,
  is_claimable boolean default false,
  claimed boolean default false,
  notes text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

alter table public.expenses enable row level security;

drop policy if exists "admin full access expenses" on public.expenses;
create policy "admin full access expenses" on public.expenses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org members select expenses" on public.expenses;
create policy "org members select expenses" on public.expenses
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write expenses" on public.expenses;
create policy "org members write expenses" on public.expenses
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_expenses_org_id on public.expenses(org_id);
create index if not exists idx_expenses_date on public.expenses(date desc);
create index if not exists idx_expenses_created_at on public.expenses(created_at desc);

drop trigger if exists update_expenses_updated_at on public.expenses;
create trigger update_expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.update_updated_at_column();
