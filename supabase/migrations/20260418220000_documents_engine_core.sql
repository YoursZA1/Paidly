-- Unified document engine: documents, line items, audit events; optional payments.document_id

create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('invoice', 'quote', 'payslip')),
  status text not null default 'draft',
  client_id uuid references public.clients(id) on delete set null,
  document_number text,
  title text,
  issue_date date,
  due_date date,
  valid_until date,
  subtotal numeric(14,2) not null default 0,
  tax_rate numeric(10,4) default 0,
  tax_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  currency text not null default 'ZAR',
  metadata jsonb not null default '{}'::jsonb,
  public_share_token text,
  source_document_id uuid references public.documents(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_org_type_idx on public.documents (org_id, type);
create index if not exists documents_org_status_idx on public.documents (org_id, status);
create index if not exists documents_org_created_idx on public.documents (org_id, created_at desc);

create table if not exists public.document_items (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  line_order int not null default 0,
  description text,
  quantity numeric(14,4) not null default 1,
  unit_price numeric(14,2) not null default 0,
  total_price numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_items_document_id_idx on public.document_items (document_id);

create table if not exists public.document_events (
  id uuid primary key default uuid_generate_v4(),
  document_id uuid not null references public.documents(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists document_events_document_id_idx on public.document_events (document_id);
create index if not exists document_events_org_created_idx on public.document_events (org_id, created_at desc);

alter table public.payments add column if not exists document_id uuid references public.documents(id) on delete set null;
create index if not exists payments_document_id_idx on public.payments (document_id);

alter table public.documents enable row level security;
alter table public.document_items enable row level security;
alter table public.document_events enable row level security;

drop policy if exists "admin full access documents" on public.documents;
create policy "admin full access documents" on public.documents
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select documents" on public.documents;
create policy "org members select documents" on public.documents
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = documents.org_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "org members write documents" on public.documents;
create policy "org members write documents" on public.documents
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = documents.org_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = documents.org_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "admin full access document items" on public.document_items;
create policy "admin full access document items" on public.document_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select document items" on public.document_items;
create policy "org members select document items" on public.document_items
  for select
  using (exists (
    select 1 from public.documents d
    join public.memberships m on m.org_id = d.org_id
    where d.id = document_items.document_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "org members write document items" on public.document_items;
create policy "org members write document items" on public.document_items
  for all
  using (exists (
    select 1 from public.documents d
    join public.memberships m on m.org_id = d.org_id
    where d.id = document_items.document_id and m.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.documents d
    join public.memberships m on m.org_id = d.org_id
    where d.id = document_items.document_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "admin full access document events" on public.document_events;
create policy "admin full access document events" on public.document_events
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "org members select document events" on public.document_events;
create policy "org members select document events" on public.document_events
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = document_events.org_id and m.user_id = (select auth.uid())
  ));

drop policy if exists "org members insert document events" on public.document_events;
create policy "org members insert document events" on public.document_events
  for insert
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = document_events.org_id and m.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.documents d
      where d.id = document_events.document_id and d.org_id = document_events.org_id
    )
  );

drop policy if exists "org members delete document events" on public.document_events;
create policy "org members delete document events" on public.document_events
  for delete
  using (exists (
    select 1 from public.memberships m
    where m.org_id = document_events.org_id and m.user_id = (select auth.uid())
  ));

drop trigger if exists update_documents_updated_at on public.documents;
create trigger update_documents_updated_at
  before update on public.documents
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_document_items_updated_at on public.document_items;
create trigger update_document_items_updated_at
  before update on public.document_items
  for each row
  execute function public.update_updated_at_column();

do $$
begin
  alter publication supabase_realtime add table public.documents;
exception when duplicate_object then null;
end $$;
