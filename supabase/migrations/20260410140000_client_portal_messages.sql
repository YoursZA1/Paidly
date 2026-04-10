-- Client portal messaging (service-role API only; RLS enabled with no policies = locked to service role).
create table if not exists public.client_portal_messages (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  sender_type text not null check (sender_type in ('client', 'business')),
  subject text,
  content text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_portal_messages_client_created
  on public.client_portal_messages (client_id, created_at desc);

alter table public.client_portal_messages enable row level security;
