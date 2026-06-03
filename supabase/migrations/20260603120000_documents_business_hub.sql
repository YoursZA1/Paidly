-- Business Document Hub: make the unified `documents` engine polymorphic across all business
-- document kinds (financial, sales, projects, HR, operations, reports, events) without per-type
-- tables. Adds catalog reference tables, relaxes the type CHECK, extends `documents`, and adds
-- supporting tables (templates, attachments, comments, links). Activity continues to use
-- `document_events`. Additive + backfilled; legacy invoices/quotes/payslips tables are untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catalog reference tables (app config; mirrors src/document-engine/documentCatalog.js)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_categories (
  key text primary key,
  label text not null,
  icon text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.document_types (
  key text primary key,
  category_key text not null references public.document_categories(key) on delete restrict,
  label text not null,
  icon text,
  is_financial boolean not null default false,
  flow text not null default 'financial',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists document_types_category_idx on public.document_types (category_key);

insert into public.document_categories (key, label, icon, sort_order) values
  ('financial', 'Financial', 'Receipt', 1),
  ('sales', 'Sales & Client', 'Handshake', 2),
  ('projects', 'Projects', 'FolderKanban', 3),
  ('hr', 'HR', 'Users', 4),
  ('operations', 'Operations', 'Settings2', 5),
  ('reports', 'Reports', 'BarChart3', 6),
  ('events', 'Events', 'CalendarDays', 7)
on conflict (key) do update set label = excluded.label, icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.document_types (key, category_key, label, is_financial, flow, sort_order) values
  ('invoice', 'financial', 'Invoice', true, 'financial', 1),
  ('quote', 'financial', 'Quote', true, 'financial', 2),
  ('proforma_invoice', 'financial', 'Proforma Invoice', true, 'financial', 3),
  ('credit_note', 'financial', 'Credit Note', true, 'financial', 4),
  ('debit_note', 'financial', 'Debit Note', true, 'financial', 5),
  ('receipt', 'financial', 'Receipt', true, 'financial', 6),
  ('purchase_order', 'financial', 'Purchase Order', true, 'approval', 7),
  ('expense_claim', 'financial', 'Expense Claim', true, 'approval', 8),
  ('proposal', 'sales', 'Proposal', false, 'signature', 1),
  ('contract', 'sales', 'Contract', false, 'signature', 2),
  ('service_agreement', 'sales', 'Service Agreement', false, 'signature', 3),
  ('scope_of_work', 'sales', 'Scope of Work', false, 'signature', 4),
  ('nda', 'sales', 'NDA', false, 'signature', 5),
  ('retainer_agreement', 'sales', 'Retainer Agreement', false, 'signature', 6),
  ('change_request', 'sales', 'Change Request', false, 'approval', 7),
  ('job_card', 'projects', 'Job Card', false, 'approval', 1),
  ('job_breakdown', 'projects', 'Job Breakdown', false, 'simple', 2),
  ('creative_brief', 'projects', 'Creative Brief', false, 'simple', 3),
  ('project_brief', 'projects', 'Project Brief', false, 'simple', 4),
  ('status_report', 'projects', 'Status Report', false, 'report', 5),
  ('handover_document', 'projects', 'Handover Document', false, 'approval', 6),
  ('payslip', 'hr', 'Payslip', true, 'financial', 1),
  ('employment_contract', 'hr', 'Employment Contract', false, 'signature', 2),
  ('offer_letter', 'hr', 'Offer Letter', false, 'signature', 3),
  ('leave_request', 'hr', 'Leave Request', false, 'approval', 4),
  ('performance_review', 'hr', 'Performance Review', false, 'approval', 5),
  ('sop', 'operations', 'SOP', false, 'simple', 1),
  ('checklist', 'operations', 'Checklist', false, 'simple', 2),
  ('inspection_report', 'operations', 'Inspection Report', false, 'report', 3),
  ('incident_report', 'operations', 'Incident Report', false, 'report', 4),
  ('delivery_note', 'operations', 'Delivery Note', false, 'approval', 5),
  ('revenue_report', 'reports', 'Revenue Report', false, 'report', 1),
  ('client_report', 'reports', 'Client Report', false, 'report', 2),
  ('sales_report', 'reports', 'Sales Report', false, 'report', 3),
  ('expense_report', 'reports', 'Expense Report', false, 'report', 4),
  ('project_report', 'reports', 'Project Report', false, 'report', 5),
  ('marketing_report', 'reports', 'Marketing Report', false, 'report', 6),
  ('event_brief', 'events', 'Event Brief', false, 'simple', 1),
  ('sponsorship_proposal', 'events', 'Sponsorship Proposal', false, 'signature', 2),
  ('event_budget', 'events', 'Event Budget', true, 'financial', 3),
  ('run_sheet', 'events', 'Run Sheet', false, 'simple', 4),
  ('attendance_report', 'events', 'Attendance Report', false, 'report', 5)
on conflict (key) do update set
  category_key = excluded.category_key,
  label = excluded.label,
  is_financial = excluded.is_financial,
  flow = excluded.flow,
  sort_order = excluded.sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Make `documents` polymorphic: drop the 3-type CHECK, add hub columns + FK to catalog
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.documents drop constraint if exists documents_type_check;

alter table public.documents add column if not exists category_key text;
alter table public.documents add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.documents add column if not exists archived_at timestamptz;
alter table public.documents add column if not exists body text;
alter table public.documents add column if not exists template_id uuid;

-- Backfill category for existing rows from the seeded catalog.
update public.documents d
set category_key = t.category_key
from public.document_types t
where d.type = t.key and d.category_key is null;

-- Now that data is consistent, wire FK integrity to the catalog.
do $$
begin
  alter table public.documents
    add constraint documents_type_fk foreign key (type)
    references public.document_types(key) on update cascade;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.documents
    add constraint documents_category_fk foreign key (category_key)
    references public.document_categories(key) on update cascade;
exception when duplicate_object then null;
end $$;

create index if not exists documents_org_category_idx on public.documents (org_id, category_key);
create index if not exists documents_org_assigned_idx on public.documents (org_id, assigned_user_id);
create index if not exists documents_org_archived_idx on public.documents (org_id, archived_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Supporting tables: templates, attachments, comments, links
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_templates (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null references public.document_types(key) on update cascade,
  category_key text references public.document_categories(key) on update cascade,
  name text not null,
  description text,
  content jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_templates_org_type_idx on public.document_templates (org_id, type);
-- At most one default template per (org, type).
create unique index if not exists document_templates_one_default_idx
  on public.document_templates (org_id, type) where is_default;

create table if not exists public.document_attachments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists document_attachments_document_idx on public.document_attachments (document_id);

create table if not exists public.document_comments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_comments_document_idx on public.document_comments (document_id, created_at);

create table if not exists public.document_links (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_document_id uuid not null references public.documents(id) on delete cascade,
  to_document_id uuid not null references public.documents(id) on delete cascade,
  relation text not null default 'linked',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists document_links_unique_idx
  on public.document_links (from_document_id, to_document_id, relation);
create index if not exists document_links_to_idx on public.document_links (to_document_id);

-- template_id FK now that the table exists.
do $$
begin
  alter table public.documents
    add constraint documents_template_fk foreign key (template_id)
    references public.document_templates(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.document_categories enable row level security;
alter table public.document_types enable row level security;
alter table public.document_templates enable row level security;
alter table public.document_attachments enable row level security;
alter table public.document_comments enable row level security;
alter table public.document_links enable row level security;

-- Catalog tables: readable by any authenticated user; only admins may modify.
drop policy if exists "read document categories" on public.document_categories;
create policy "read document categories" on public.document_categories
  for select using ((select auth.uid()) is not null);
drop policy if exists "admin write document categories" on public.document_categories;
create policy "admin write document categories" on public.document_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read document types" on public.document_types;
create policy "read document types" on public.document_types
  for select using ((select auth.uid()) is not null);
drop policy if exists "admin write document types" on public.document_types;
create policy "admin write document types" on public.document_types
  for all using (public.is_admin()) with check (public.is_admin());

-- Helper pattern: org membership for the row's org_id.
drop policy if exists "admin full access document templates" on public.document_templates;
create policy "admin full access document templates" on public.document_templates
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "org members rw document templates" on public.document_templates;
create policy "org members rw document templates" on public.document_templates
  for all
  using (exists (select 1 from public.memberships m where m.org_id = document_templates.org_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.org_id = document_templates.org_id and m.user_id = (select auth.uid())));

drop policy if exists "admin full access document attachments" on public.document_attachments;
create policy "admin full access document attachments" on public.document_attachments
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "org members rw document attachments" on public.document_attachments;
create policy "org members rw document attachments" on public.document_attachments
  for all
  using (exists (select 1 from public.memberships m where m.org_id = document_attachments.org_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.org_id = document_attachments.org_id and m.user_id = (select auth.uid())));

drop policy if exists "admin full access document comments" on public.document_comments;
create policy "admin full access document comments" on public.document_comments
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "org members rw document comments" on public.document_comments;
create policy "org members rw document comments" on public.document_comments
  for all
  using (exists (select 1 from public.memberships m where m.org_id = document_comments.org_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.org_id = document_comments.org_id and m.user_id = (select auth.uid())));

drop policy if exists "admin full access document links" on public.document_links;
create policy "admin full access document links" on public.document_links
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "org members rw document links" on public.document_links;
create policy "org members rw document links" on public.document_links
  for all
  using (exists (select 1 from public.memberships m where m.org_id = document_links.org_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.org_id = document_links.org_id and m.user_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at triggers
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists update_document_templates_updated_at on public.document_templates;
create trigger update_document_templates_updated_at
  before update on public.document_templates
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_document_comments_updated_at on public.document_comments;
create trigger update_document_comments_updated_at
  before update on public.document_comments
  for each row execute function public.update_updated_at_column();
