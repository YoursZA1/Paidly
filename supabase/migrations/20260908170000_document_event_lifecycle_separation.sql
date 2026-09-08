-- Separate quote vs invoice Observe events. Additive; existing rows stay valid.

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_lifecycle_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_lifecycle_check
  CHECK (
    source_kind = 'hub'
    OR (
      source_kind = 'quote'
      AND event_type IN (
        'created', 'updated', 'sent', 'opened', 'clicked', 'reminded',
        'accepted', 'rejected', 'expired', 'converted_to_invoice',
        'viewed', 'status_changed', 'converted', 'created_from_quote'
      )
    )
    OR (
      source_kind = 'invoice'
      AND event_type IN (
        'created', 'updated', 'sent', 'opened', 'clicked', 'reminded',
        'paid', 'viewed_not_paid', 'due_soon', 'due_today', 'overdue',
        'payment_intent', 'viewed', 'status_changed', 'created_from_quote'
      )
    )
  );

CREATE INDEX IF NOT EXISTS document_events_kind_type_idx
  ON public.document_events (org_id, source_kind, event_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.record_commercial_document_created()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  kind text := TG_ARGV[0];
BEGIN
  INSERT INTO public.document_events (
    org_id, document_id, source_kind, source_id, document_type, event_type,
    payload, actor_type, client_id, occurred_at, idempotency_key
  ) VALUES (
    NEW.org_id,
    NULL,
    kind,
    NEW.id,
    kind,
    'created',
    jsonb_build_object('source', 'insert_trigger'),
    'user',
    NEW.client_id,
    now(),
    'created:' || kind || ':' || NEW.id::text
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_record_created_event ON public.invoices;
CREATE TRIGGER invoices_record_created_event
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.record_commercial_document_created('invoice');

DROP TRIGGER IF EXISTS quotes_record_created_event ON public.quotes;
CREATE TRIGGER quotes_record_created_event
  AFTER INSERT ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.record_commercial_document_created('quote');

COMMENT ON FUNCTION public.record_commercial_document_created() IS
  'Append-only created event. Document row remains source of truth for status.';
