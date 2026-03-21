-- Pre-launch waitlist; rows inserted only via Paidly API (service role).
CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_signups_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx ON public.waitlist_signups (created_at DESC);

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.waitlist_signups IS 'Marketing waitlist emails; no client policies — API uses service role.';
