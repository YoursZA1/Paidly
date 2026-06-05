-- Document Workflow Tables: delivery tracking + e-signature requests.
-- Additive migration — no existing tables are modified destructively.

-- ─────────────────────────────────────────────────────────────────────────────
-- document_sends  (delivery tracking)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_sends (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  document_id    uuid        not null references public.documents(id) on delete cascade,
  recipient_name text,
  recipient_email text       not null,
  subject        text,
  message        text,
  include_pdf    boolean     not null default true,
  include_branding boolean   not null default true,
  sent_at        timestamptz not null default now(),
  opened_at      timestamptz,
  downloaded_at  timestamptz,
  created_by     uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists document_sends_document_id_idx on public.document_sends (document_id);
create index if not exists document_sends_org_id_idx       on public.document_sends (org_id);

alter table public.document_sends enable row level security;

create policy "document_sends_org_select" on public.document_sends
  for select using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_sends_org_insert" on public.document_sends
  for insert with check (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_sends_org_update" on public.document_sends
  for update using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_sends_org_delete" on public.document_sends
  for delete using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- document_signatures  (e-signature requests per signer)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.document_signatures (
  id             uuid        primary key default gen_random_uuid(),
  org_id         uuid        not null references public.organizations(id) on delete cascade,
  document_id    uuid        not null references public.documents(id) on delete cascade,
  signer_name    text,
  signer_email   text        not null,
  signing_order  int         not null default 1,
  status         text        not null default 'pending'
    check (status in ('pending', 'viewed', 'signed', 'declined', 'expired')),
  signed_at      timestamptz,
  viewed_at      timestamptz,
  ip_address     text,
  device_info    text,
  token          text        unique default encode(gen_random_bytes(32), 'hex'),
  created_by     uuid        references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists document_signatures_document_id_idx on public.document_signatures (document_id);
create index if not exists document_signatures_org_id_idx       on public.document_signatures (org_id);

alter table public.document_signatures enable row level security;

create policy "document_signatures_org_select" on public.document_signatures
  for select using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_signatures_org_insert" on public.document_signatures
  for insert with check (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_signatures_org_update" on public.document_signatures
  for update using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

create policy "document_signatures_org_delete" on public.document_signatures
  for delete using (org_id in (select org_id from public.memberships where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- Extend documents with workflow columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.documents add column if not exists pdf_url            text;
alter table public.documents add column if not exists last_sent_at       timestamptz;
alter table public.documents add column if not exists signature_status   text
  check (signature_status in ('draft','awaiting_signature','partially_signed','signed','completed','expired','declined'));
