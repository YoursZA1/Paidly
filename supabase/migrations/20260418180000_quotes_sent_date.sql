-- When the quote was first sent (parity with invoices.sent_date for analytics and UI).
alter table public.quotes
  add column if not exists sent_date timestamptz null;

comment on column public.quotes.sent_date is 'Timestamp when the quote was first marked sent (e.g. after email send).';

create index if not exists idx_quotes_sent_date
  on public.quotes (sent_date desc)
  where sent_date is not null;
