-- Invoice → quote lineage for unified documents: analytics, UI "view quote", dedupe conversions.
-- `source_document_id` remains a generic provenance link; `source_quote_id` is the canonical quote FK for invoices.

alter table public.documents
  add column if not exists source_quote_id uuid references public.documents (id) on delete set null;

comment on column public.documents.source_quote_id is
  'For type=invoice: unified quote document this invoice was converted from. Enforces at most one such invoice per (org, quote) via partial unique index.';

-- Backfill from historical conversions that only set source_document_id on invoices.
update public.documents d
set source_quote_id = d.source_document_id
where d.type = 'invoice'
  and d.source_quote_id is null
  and d.source_document_id is not null
  and exists (
    select 1
    from public.documents q
    where q.id = d.source_document_id
      and q.type = 'quote'
      and q.org_id = d.org_id
  );

create index if not exists documents_source_quote_id_idx
  on public.documents (source_quote_id)
  where source_quote_id is not null;

-- At most one invoice per org per source quote (conversion idempotency + reporting).
create unique index if not exists documents_one_invoice_per_source_quote
  on public.documents (org_id, source_quote_id)
  where type = 'invoice' and source_quote_id is not null;
