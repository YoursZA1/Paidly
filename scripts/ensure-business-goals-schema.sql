-- Business goals: one row per user per year. Only the workspace owner can insert/update/delete.
-- Run in Supabase SQL Editor.

create table if not exists public.business_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year smallint not null,
  annual_target numeric(12,2) not null default 0,
  strategy_type text not null default 'steady' check (strategy_type in ('aggressive', 'steady')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year)
);

alter table public.business_goals enable row level security;

-- Anyone can read their own goal row(s)
drop policy if exists "users select own business_goals" on public.business_goals;
create policy "users select own business_goals" on public.business_goals
  for select using (user_id = auth.uid());

-- Only the workspace owner can insert/update/delete (their own row)
drop policy if exists "owner insert business_goals" on public.business_goals;
create policy "owner insert business_goals" on public.business_goals
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and o.owner_id = auth.uid()
    )
  );

drop policy if exists "owner update business_goals" on public.business_goals;
create policy "owner update business_goals" on public.business_goals
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and o.owner_id = auth.uid()
    )
  ) with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and o.owner_id = auth.uid()
    )
  );

drop policy if exists "owner delete business_goals" on public.business_goals;
create policy "owner delete business_goals" on public.business_goals
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from public.memberships m
      join public.organizations o on o.id = m.org_id
      where m.user_id = auth.uid() and o.owner_id = auth.uid()
    )
  );

-- Keep updated_at in sync
create or replace function public.set_business_goals_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists business_goals_updated_at on public.business_goals;
create trigger business_goals_updated_at
  before update on public.business_goals
  for each row execute procedure public.set_business_goals_updated_at();
