-- Multi-channel admin messaging: per-message channel controls + per-user delivery tracking.

alter table if exists public.admin_platform_messages
  add column if not exists send_email boolean not null default true,
  add column if not exists send_in_app boolean not null default true,
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_platform_messages_status_check'
      and conrelid = 'public.admin_platform_messages'::regclass
  ) then
    alter table public.admin_platform_messages
      add constraint admin_platform_messages_status_check
      check (status in ('pending', 'sent'));
  end if;
end $$;

create table if not exists public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.admin_platform_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('email', 'in_app')),
  status text not null default 'pending',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id, channel)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'message_deliveries_status_check'
      and conrelid = 'public.message_deliveries'::regclass
  ) then
    alter table public.message_deliveries
      add constraint message_deliveries_status_check
      check (status in ('pending', 'sent', 'failed', 'read'));
  end if;
end $$;

create index if not exists idx_message_deliveries_user_channel_status
  on public.message_deliveries (user_id, channel, status);

create index if not exists idx_message_deliveries_message
  on public.message_deliveries (message_id);

alter table public.message_deliveries enable row level security;

-- Users can read their own delivered rows.
drop policy if exists "Users can view own message deliveries" on public.message_deliveries;
create policy "Users can view own message deliveries"
  on public.message_deliveries
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Users can only mark in-app messages as read on their own rows.
drop policy if exists "Users can update own in-app delivery read state" on public.message_deliveries;
create policy "Users can update own in-app delivery read state"
  on public.message_deliveries
  for update
  to authenticated
  using (auth.uid() = user_id and channel = 'in_app')
  with check (auth.uid() = user_id and channel = 'in_app');

-- Keep updated_at fresh for read state changes.
create or replace function public.touch_message_deliveries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_message_deliveries_updated_at on public.message_deliveries;
create trigger trg_touch_message_deliveries_updated_at
before update on public.message_deliveries
for each row
execute function public.touch_message_deliveries_updated_at();

-- Allow recipients to read message content tied to their own delivery rows.
drop policy if exists "Users can view own admin platform messages" on public.admin_platform_messages;
create policy "Users can view own admin platform messages"
  on public.admin_platform_messages
  for select
  to authenticated
  using (auth.uid() = recipient_id);
