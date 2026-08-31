CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Company invite delivery metadata + one pending invite per email/org.
-- Reuses public.company_invites. Do not add a second invitation table.
-- token remains the durable share secret (64-char hex). token_hash is SHA-256 of that token.

ALTER TABLE public.company_invites
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_hash text;

COMMENT ON COLUMN public.company_invites.email_sent_at IS
  'Set only after the email provider confirms submission. Null means the invite exists but was not emailed.';
COMMENT ON COLUMN public.company_invites.token_hash IS
  'SHA-256 hex of company_invites.token. Do not log or return the raw token except as a reconstructed admin invite_link.';

UPDATE public.company_invites
SET token_hash = encode(digest(convert_to(token, 'UTF8'), 'sha256'), 'hex')
WHERE token IS NOT NULL
  AND token_hash IS NULL
  AND length(token) > 0;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS company_invites_one_pending_email_org_uidx
    ON public.company_invites (org_id, lower(email))
    WHERE status = 'pending';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Skipped unique pending invite index (clean duplicate pending rows, then re-run): %', SQLERRM;
END $$;
