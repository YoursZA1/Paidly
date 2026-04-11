-- Admin → platform user outreach (stored in-app; admin UI + optional email via app SendEmail).
-- RLS enabled with no policies: reads/writes go through service role (admin API) only.

create table if not exists public.admin_platform_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null default '',
  content text not null default '',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_platform_messages_recipient_created
  on public.admin_platform_messages (recipient_id, created_at desc);

create index if not exists idx_admin_platform_messages_created
  on public.admin_platform_messages (created_at desc);

alter table public.admin_platform_messages enable row level security;

-- No GRANT to anon/authenticated: JWT clients cannot read/write this table directly.
-- Admin API uses the Supabase service role, which bypasses RLS.

comment on table public.admin_platform_messages is 'Messages from Paidly admins to platform users (profiles.id); accessed via admin API with service role.';
