-- Track each sent document (invoice/quote) with channel (Email/WhatsApp) for Messages page
-- Enables: Document, Client, Channel, Status, Opened, Viewed Time, Paid, Payment Time
create table if not exists public.document_sends (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'quote')),
  document_id uuid not null,
  client_id uuid references public.clients(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_document_sends_org_id on public.document_sends(org_id);
create index if not exists idx_document_sends_document on public.document_sends(document_type, document_id);
create index if not exists idx_document_sends_sent_at on public.document_sends(sent_at desc);

alter table public.document_sends enable row level security;

drop policy if exists "admin full access document_sends" on public.document_sends;
drop policy if exists "org members select document_sends" on public.document_sends;
drop policy if exists "org members insert document_sends" on public.document_sends;
drop policy if exists "org members update document_sends" on public.document_sends;
drop policy if exists "org members delete document_sends" on public.document_sends;

create policy "admin full access document_sends" on public.document_sends for all using (public.is_admin());
create policy "org members select document_sends" on public.document_sends for select
  using (
    exists (select 1 from public.memberships m where m.org_id = document_sends.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members insert document_sends" on public.document_sends for insert
  with check (
    exists (select 1 from public.memberships m where m.org_id = document_sends.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members update document_sends" on public.document_sends for update
  using (
    exists (select 1 from public.memberships m where m.org_id = document_sends.org_id and m.user_id = (select auth.uid()))
  );
create policy "org members delete document_sends" on public.document_sends for delete
  using (
    exists (select 1 from public.memberships m where m.org_id = document_sends.org_id and m.user_id = (select auth.uid()))
  );

comment on table public.document_sends is 'Each sent document (invoice/quote) per channel (email/whatsapp) for Messages page tracking';
