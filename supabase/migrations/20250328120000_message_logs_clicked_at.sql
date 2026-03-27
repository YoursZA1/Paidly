-- Track first link click from branded emails (CTA redirect)
alter table public.message_logs add column if not exists clicked_at timestamptz;

comment on column public.message_logs.clicked_at is 'When the client first clicked a tracked CTA link in the email';
