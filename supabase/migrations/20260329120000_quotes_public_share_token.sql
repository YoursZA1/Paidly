-- Align quotes with client selects (SUPABASE_SELECT_COLUMNS.quotes) and invoice public-link pattern.
alter table public.quotes
  add column if not exists public_share_token text;

comment on column public.quotes.public_share_token is 'Opaque token for public quote view / share links';

create index if not exists idx_quotes_public_share_token
  on public.quotes (public_share_token)
  where public_share_token is not null;
