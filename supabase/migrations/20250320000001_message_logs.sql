-- Message logs: one row per sent message (document link) with tracking and outcome fields
create table if not exists public.message_logs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_type text,
  document_id uuid,
  client_id uuid references public.clients(id) on delete set null,
  channel text,
  recipient text,
  sent_at timestamptz,
  opened_at timestamptz,
  viewed boolean default false,
  paid boolean default false,
  payment_date timestamptz,
  tracking_token text,
  created_at timestamptz not null default now()
);

create index if not exists idx_message_logs_org_id on public.message_logs(org_id);
create index if not exists idx_message_logs_document on public.message_logs(document_type, document_id);
create index if not exists idx_message_logs_sent_at on public.message_logs(sent_at desc);
create index if not exists idx_message_logs_tracking_token on public.message_logs(tracking_token) where tracking_token is not null;

alter table public.message_logs enable row level security;

drop policy if exists "admin full access message_logs" on public.message_logs;
drop policy if exists "org members select message_logs" on public.message_logs;
drop policy if exists "org members insert message_logs" on public.message_logs;
drop policy if exists "org members update message_logs" on public.message_logs;
drop policy if exists "org members delete message_logs" on public.message_logs;

create policy "admin full access message_logs" on public.message_logs for all using (public.is_admin());
create policy "org members select message_logs" on public.message_logs for select
  using (
    exists (select 1 from public.memberships m where m.org_id = message_logs.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members insert message_logs" on public.message_logs for insert
  with check (
    exists (select 1 from public.memberships m where m.org_id = message_logs.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members update message_logs" on public.message_logs for update
  using (
    exists (select 1 from public.memberships m where m.org_id = message_logs.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members delete message_logs" on public.message_logs for delete
  using (
    exists (select 1 from public.memberships m where m.org_id = message_logs.org_id and m.user_id = (select auth.uid()))
  );

comment on table public.message_logs is 'Log of sent messages (document links) with recipient, channel, opened/viewed/paid tracking';
