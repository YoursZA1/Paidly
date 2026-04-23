-- Communication Hub metadata: explicit channel + delivery lifecycle on admin messages.

alter table if exists public.admin_platform_messages
  add column if not exists channel text not null default 'both',
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_reason text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_platform_messages_status_check'
      and conrelid = 'public.admin_platform_messages'::regclass
  ) then
    alter table public.admin_platform_messages
      drop constraint admin_platform_messages_status_check;
  end if;
end $$;

alter table public.admin_platform_messages
  add constraint admin_platform_messages_status_check
  check (status in ('pending', 'sent', 'delivered', 'opened', 'failed'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_platform_messages_channel_check'
      and conrelid = 'public.admin_platform_messages'::regclass
  ) then
    alter table public.admin_platform_messages
      drop constraint admin_platform_messages_channel_check;
  end if;
end $$;

alter table public.admin_platform_messages
  add constraint admin_platform_messages_channel_check
  check (channel in ('email', 'in_app', 'both'));
