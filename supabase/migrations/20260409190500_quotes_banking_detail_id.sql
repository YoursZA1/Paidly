-- Persist preferred bank details on quotes so quote -> invoice conversion
-- can prefill the selected banking account consistently.
alter table public.quotes
add column if not exists banking_detail_id uuid references public.banking_details(id) on delete set null;

create index if not exists quotes_banking_detail_id_idx
on public.quotes (banking_detail_id);
