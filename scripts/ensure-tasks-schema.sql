-- Ensure tasks table exists (match Task_export.csv and user activity). Task entity uses this table.
-- Run in Supabase SQL Editor. Requires public.organizations, public.clients. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  description text,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to text,
  due_date date,
  priority text default 'medium',
  status text default 'pending',
  category text default 'other',
  parent_task_id uuid references public.tasks(id) on delete set null,
  depends_on jsonb default '[]',
  estimated_hours numeric(12,2),
  tags text[] default '{}',
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

-- Existing DBs: CREATE TABLE IF NOT EXISTS does not add org_id.
alter table if exists public.tasks add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table if exists public.tasks add column if not exists title text;
alter table if exists public.tasks add column if not exists description text;
alter table if exists public.tasks add column if not exists client_id uuid;
alter table if exists public.tasks add column if not exists assigned_to text;
alter table if exists public.tasks add column if not exists due_date date;
alter table if exists public.tasks add column if not exists priority text default 'medium';
alter table if exists public.tasks add column if not exists status text default 'pending';
alter table if exists public.tasks add column if not exists category text default 'other';
alter table if exists public.tasks add column if not exists created_by_id uuid references auth.users(id) on delete set null;
alter table if exists public.tasks add column if not exists created_at timestamptz default now();
alter table if exists public.tasks add column if not exists updated_at timestamptz default now();
alter table if exists public.tasks add column if not exists is_sample boolean default false;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'created_by_id'
  ) then
    update public.tasks t
    set org_id = m.org_id
    from public.memberships m
    where t.org_id is null and t.created_by_id = m.user_id;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'user_id'
  ) then
    update public.tasks t
    set org_id = m.org_id
    from public.memberships m
    where t.org_id is null and t.user_id = m.user_id;
  end if;
end $$;

alter table public.tasks enable row level security;

drop policy if exists "admin full access tasks" on public.tasks;
create policy "admin full access tasks" on public.tasks
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org members select tasks" on public.tasks;
create policy "org members select tasks" on public.tasks
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write tasks" on public.tasks;
create policy "org members write tasks" on public.tasks
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_tasks_org_id on public.tasks(org_id);
create index if not exists idx_tasks_due_date on public.tasks(due_date desc);
create index if not exists idx_tasks_created_at on public.tasks(created_at desc);
create index if not exists idx_tasks_status on public.tasks(status);

drop trigger if exists update_tasks_updated_at on public.tasks;
create trigger update_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.update_updated_at_column();
