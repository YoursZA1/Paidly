-- Ensure notes table exists. Notes are personal per user (filtered by auth.uid()).
-- Run in Supabase SQL Editor.

create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  category text default 'General',
  is_pinned boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notes enable row level security;

-- Users can only access their own notes (filtered by auth.uid())
drop policy if exists "users select own notes" on public.notes;
create policy "users select own notes" on public.notes
  for select using (user_id = auth.uid());

drop policy if exists "users insert own notes" on public.notes;
create policy "users insert own notes" on public.notes
  for insert with check (user_id = auth.uid());

drop policy if exists "users update own notes" on public.notes;
create policy "users update own notes" on public.notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete own notes" on public.notes;
create policy "users delete own notes" on public.notes
  for delete using (user_id = auth.uid());

create index if not exists idx_notes_user_id on public.notes(user_id);
create index if not exists idx_notes_updated_at on public.notes(updated_at desc);

-- Ensure update_updated_at_column exists (common in Paidly schemas)
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists update_notes_updated_at on public.notes;
create trigger update_notes_updated_at
  before update on public.notes
  for each row
  execute function public.update_updated_at_column();
