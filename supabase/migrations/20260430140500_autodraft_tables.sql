create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'payslip')),
  draft_key text not null default 'default',
  form_data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, document_type, draft_key)
);

create table if not exists public.draft_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'payslip')),
  draft_key text not null default 'default',
  form_data jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.drafts enable row level security;
alter table public.draft_versions enable row level security;

drop policy if exists drafts_select_own on public.drafts;
create policy drafts_select_own on public.drafts for select to authenticated using (auth.uid() = user_id);

drop policy if exists draft_versions_select_own on public.draft_versions;
create policy draft_versions_select_own on public.draft_versions for select to authenticated using (auth.uid() = user_id);
