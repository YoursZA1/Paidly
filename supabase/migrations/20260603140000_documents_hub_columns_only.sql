-- Incremental patch: add documents hub columns when the full business-hub migration has not run yet.
-- Safe to apply repeatedly (IF NOT EXISTS). After applying, reload the PostgREST schema cache in Supabase
-- (Dashboard → Settings → API → Reload schema) if columns still 404 in the app.

alter table public.documents add column if not exists category_key text;
alter table public.documents add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;
alter table public.documents add column if not exists archived_at timestamptz;
alter table public.documents add column if not exists body text;
alter table public.documents add column if not exists template_id uuid;

create index if not exists documents_org_category_idx on public.documents (org_id, category_key);
create index if not exists documents_org_assigned_idx on public.documents (org_id, assigned_user_id);
create index if not exists documents_org_archived_idx on public.documents (org_id, archived_at);

-- Backfill category for legacy rows when catalog tables exist (no-op if document_types missing).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'document_types'
  ) then
    update public.documents d
    set category_key = t.category_key
    from public.document_types t
    where d.type = t.key and d.category_key is null;
  end if;
exception when others then null;
end $$;
