-- Ensure packages table exists (match Package_export.csv and user activity)
-- Run in Supabase SQL Editor. Requires public.organizations. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.packages (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  currency text default 'ZAR',
  frequency text default '/month',
  features jsonb default '[]',
  is_recommended boolean default false,
  website_link text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

alter table public.packages enable row level security;

drop policy if exists "admin full access packages" on public.packages;
create policy "admin full access packages" on public.packages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "packages select platform or own org" on public.packages;
create policy "packages select platform or own org" on public.packages
  for select to authenticated
  using (
    packages.org_id is null
    or exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "packages insert admin or org" on public.packages;
create policy "packages insert admin or org" on public.packages
  for insert to authenticated
  with check (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

drop policy if exists "packages update admin or org" on public.packages;
create policy "packages update admin or org" on public.packages
  for update to authenticated
  using (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  )
  with check (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

drop policy if exists "packages delete admin or org" on public.packages;
create policy "packages delete admin or org" on public.packages
  for delete to authenticated
  using (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

create index if not exists idx_packages_org_id on public.packages(org_id);
create index if not exists idx_packages_created_at on public.packages(created_at desc);

drop trigger if exists update_packages_updated_at on public.packages;
create trigger update_packages_updated_at
  before update on public.packages
  for each row
  execute function public.update_updated_at_column();
