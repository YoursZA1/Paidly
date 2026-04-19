-- Guardrail migration for older DBs: ensure payments.org_id exists for tenant-safe payment queries.

alter table public.payments
  add column if not exists org_id uuid references public.organizations (id) on delete cascade;

comment on column public.payments.org_id is
  'Tenant scope for payment records; required for RLS and org-anchored payment queries.';

-- Best-effort backfill from related invoice or unified document.
update public.payments p
set org_id = i.org_id
from public.invoices i
where p.org_id is null
  and p.invoice_id = i.id;

update public.payments p
set org_id = d.org_id
from public.documents d
where p.org_id is null
  and p.document_id = d.id;

create index if not exists payments_org_id_idx on public.payments (org_id);
