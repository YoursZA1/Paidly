-- Additive: add scheduled_at to document_sends for the Schedule Send UX.
-- A queued background job should pick up rows where scheduled_at > sent_at
-- and is in the future. Until that scheduler exists, the column stores intent.
alter table public.document_sends
  add column if not exists scheduled_at timestamptz,
  add column if not exists channel text not null default 'email',
  add column if not exists status  text not null default 'sent'
    check (status in ('sent', 'scheduled', 'delivered', 'opened', 'downloaded', 'failed'));

-- Index for scheduler queries: find pending scheduled sends
create index if not exists document_sends_scheduled_idx
  on public.document_sends (scheduled_at)
  where scheduled_at is not null and status = 'scheduled';
