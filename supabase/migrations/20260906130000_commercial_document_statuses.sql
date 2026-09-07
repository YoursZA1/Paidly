-- Phase 08: canonical invoice / quote status machines.
-- Rewrite historical aliases, then constrain writes and transitions.
-- Does not change document totals or hub `documents` statuses.

-- ---------------------------------------------------------------------------
-- 1) Compatibility rewrite (do not drop history — map aliases onto canonical)
-- ---------------------------------------------------------------------------

UPDATE public.invoices
SET status = CASE lower(trim(status))
  WHEN 'partial_paid' THEN 'partially_paid'
  WHEN 'sending' THEN 'sent'
  WHEN 'preparing' THEN 'sent'
  WHEN 'pending' THEN 'sent'
  WHEN 'cancelled' THEN 'void'
  WHEN 'canceled' THEN 'void'
  WHEN 'converted' THEN 'sent'
  ELSE lower(trim(coalesce(status, 'draft')))
END
WHERE status IS DISTINCT FROM CASE lower(trim(status))
  WHEN 'partial_paid' THEN 'partially_paid'
  WHEN 'sending' THEN 'sent'
  WHEN 'preparing' THEN 'sent'
  WHEN 'pending' THEN 'sent'
  WHEN 'cancelled' THEN 'void'
  WHEN 'canceled' THEN 'void'
  WHEN 'converted' THEN 'sent'
  ELSE lower(trim(coalesce(status, 'draft')))
END;

UPDATE public.invoices
SET status = 'draft'
WHERE status IS NULL
   OR lower(trim(status)) NOT IN (
     'draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'
   );

UPDATE public.quotes
SET status = 'declined'
WHERE lower(trim(status)) = 'rejected';

UPDATE public.quotes
SET status = 'draft'
WHERE status IS NULL
   OR lower(trim(status)) NOT IN (
     'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'
   );

-- ---------------------------------------------------------------------------
-- 2) Canonical CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'));

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted'));

COMMENT ON COLUMN public.invoices.status IS
  'Canonical: draft, sent, viewed, partially_paid, paid, overdue, void. Aliases (partial_paid, cancelled, sending, pending) are rewritten on write.';
COMMENT ON COLUMN public.quotes.status IS
  'Canonical: draft, sent, viewed, accepted, declined, expired, converted. Legacy rejected → declined.';

-- ---------------------------------------------------------------------------
-- 3) Normalize + transition helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_invoice_status(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(raw, '')))
    WHEN '' THEN 'draft'
    WHEN 'partial_paid' THEN 'partially_paid'
    WHEN 'sending' THEN 'sent'
    WHEN 'preparing' THEN 'sent'
    WHEN 'pending' THEN 'sent'
    WHEN 'cancelled' THEN 'void'
    WHEN 'canceled' THEN 'void'
    WHEN 'converted' THEN 'sent'
    ELSE lower(trim(coalesce(raw, 'draft')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_quote_status(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(raw, '')))
    WHEN '' THEN 'draft'
    WHEN 'rejected' THEN 'declined'
    ELSE lower(trim(coalesce(raw, 'draft')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.invoice_status_can_transition(from_status text, to_status text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src text := public.normalize_invoice_status(from_status);
  dst text := public.normalize_invoice_status(to_status);
BEGIN
  IF src = dst THEN
    RETURN true;
  END IF;
  RETURN CASE src
    WHEN 'draft' THEN dst IN ('sent', 'void')
    WHEN 'sent' THEN dst IN ('viewed', 'partially_paid', 'paid', 'overdue', 'void')
    WHEN 'viewed' THEN dst IN ('partially_paid', 'paid', 'overdue', 'void')
    WHEN 'overdue' THEN dst IN ('partially_paid', 'paid', 'void')
    WHEN 'partially_paid' THEN dst IN ('paid', 'overdue', 'void')
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.quote_status_can_transition(from_status text, to_status text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  src text := public.normalize_quote_status(from_status);
  dst text := public.normalize_quote_status(to_status);
BEGIN
  IF src = dst THEN
    RETURN true;
  END IF;
  RETURN CASE src
    WHEN 'draft' THEN dst IN ('sent', 'declined', 'converted')
    WHEN 'sent' THEN dst IN ('viewed', 'accepted', 'declined', 'expired', 'converted')
    WHEN 'viewed' THEN dst IN ('accepted', 'declined', 'expired', 'converted')
    WHEN 'accepted' THEN dst IN ('converted')
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_status_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := public.normalize_invoice_status(NEW.status);
  IF NEW.status NOT IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void') THEN
    RAISE EXCEPTION 'Unsupported invoice status: %', NEW.status
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.invoice_status_can_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid invoice status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_quote_status_machine()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status := public.normalize_quote_status(NEW.status);
  IF NEW.status NOT IN ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'converted') THEN
    RAISE EXCEPTION 'Unsupported quote status: %', NEW.status
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.quote_status_can_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid quote status transition: % → %', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_status_machine ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_status_machine
  BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_status_machine();

DROP TRIGGER IF EXISTS trg_enforce_quote_status_machine ON public.quotes;
CREATE TRIGGER trg_enforce_quote_status_machine
  BEFORE INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quote_status_machine();

-- Activity notifications: recognise the canonical partial status.
CREATE OR REPLACE FUNCTION public.notify_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg text;
  target_user_id uuid;
BEGIN
  target_user_id := NULL;
  msg := NULL;

  IF tg_table_name = 'invoices' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.created_by IS NOT NULL THEN
      target_user_id := NEW.created_by;
      IF NEW.status = 'viewed' THEN
        msg := 'Invoice #' || coalesce(NEW.invoice_number, '') || ' was viewed by the client.';
      ELSIF NEW.status = 'paid' THEN
        msg := 'Invoice #' || coalesce(NEW.invoice_number, '') || ' has been fully paid.';
      ELSIF NEW.status IN ('partially_paid', 'partial_paid') THEN
        msg := 'A payment was received for Invoice #' || coalesce(NEW.invoice_number, '') || ' (partial).';
      END IF;
    END IF;
  ELSIF tg_table_name = 'quotes' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.created_by IS NOT NULL THEN
      target_user_id := NEW.created_by;
      IF NEW.status = 'viewed' THEN
        msg := 'Quote #' || coalesce(NEW.quote_number, '') || ' was viewed by the client.';
      ELSIF NEW.status = 'accepted' THEN
        msg := 'Quote #' || coalesce(NEW.quote_number, '') || ' was accepted.';
      END IF;
    END IF;
  END IF;

  IF target_user_id IS NOT NULL AND msg IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (user_id, message, read)
      VALUES (target_user_id, msg, false);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'notify_activity: failed to insert notification: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;
