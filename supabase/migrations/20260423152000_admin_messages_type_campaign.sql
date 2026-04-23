-- True communication model: direct vs broadcast campaign lineage.

alter table if exists public.admin_platform_messages
  add column if not exists message_type text not null default 'direct',
  add column if not exists campaign_id uuid;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'admin_platform_messages_message_type_check'
      and conrelid = 'public.admin_platform_messages'::regclass
  ) then
    alter table public.admin_platform_messages
      drop constraint admin_platform_messages_message_type_check;
  end if;
end $$;

alter table public.admin_platform_messages
  add constraint admin_platform_messages_message_type_check
  check (message_type in ('direct', 'broadcast'));

create index if not exists idx_admin_platform_messages_message_type_created_at
  on public.admin_platform_messages (message_type, created_at desc);

create index if not exists idx_admin_platform_messages_campaign_id
  on public.admin_platform_messages (campaign_id);
