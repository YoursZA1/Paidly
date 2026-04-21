create table if not exists public.admin_broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  content text not null,
  recipient_rows jsonb not null default '[]'::jsonb,
  total_recipients integer not null default 0,
  notifications_inserted integer not null default 0,
  messages_inserted integer not null default 0,
  email_sent integer not null default 0,
  email_skipped integer not null default 0,
  email_failed integer not null default 0,
  status text not null default 'queued',
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);

create index if not exists admin_broadcast_jobs_status_created_at_idx
  on public.admin_broadcast_jobs(status, created_at);

alter table public.admin_broadcast_jobs enable row level security;

drop policy if exists admin_broadcast_jobs_select_staff on public.admin_broadcast_jobs;
create policy admin_broadcast_jobs_select_staff
  on public.admin_broadcast_jobs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and public.profile_role_value(p) in ('admin', 'management', 'support', 'sales')
    )
  );

drop policy if exists admin_broadcast_jobs_mutate_management on public.admin_broadcast_jobs;
create policy admin_broadcast_jobs_mutate_management
  on public.admin_broadcast_jobs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and public.profile_role_value(p) in ('admin', 'management')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and public.profile_role_value(p) in ('admin', 'management')
    )
  );
