-- Client Relationship Timeline: notes, profile/relationship events, last_activity_at.
-- document_events remains the Observe log for quotes/invoices/payments/reminders.
-- Do not fabricate history: backfill only from existing rows.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.clients.last_activity_at IS
  'Latest meaningful client relationship activity (documents, payments, notes, profile changes).';

-- Payment lifecycle Observe events (invoice only). Quotes stay decision-only.
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
        'payment_intent', 'payment_processing', 'payment_failed',
        'payment_cancelled', 'payment_refunded', 'payment_partially_refunded',
        'viewed', 'status_changed', 'created_from_quote'
      )
    )
  );

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_actor_type_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_actor_type_check
  CHECK (actor_type IN (
    'system', 'user', 'recipient', 'client', 'webhook',
    'payment_gateway', 'email_provider', 'automation', 'api'
  ));

CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT client_notes_body_not_blank CHECK (length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS client_notes_client_idx
  ON public.client_notes (org_id, client_id, created_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.client_notes IS
  'Internal-only client notes. Never expose via public invoice/quote/portal/PDF.';

CREATE TABLE IF NOT EXISTS public.client_relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'user',
  actor_id uuid,
  source text,
  document_id uuid,
  document_type text,
  note_id uuid REFERENCES public.client_notes(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_relationship_events_actor_type_check
    CHECK (actor_type IN (
      'system', 'user', 'recipient', 'client', 'webhook',
      'payment_gateway', 'email_provider', 'automation', 'api'
    )),
  CONSTRAINT client_relationship_events_type_check
    CHECK (event_type IN (
      'client_created', 'client_updated',
      'note_added', 'note_updated', 'note_archived',
      'follow_up_required', 'client_contacted', 'meeting_held', 'call_completed',
      'revision_requested', 'new_quote_requested', 'payment_extension_requested'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS client_relationship_events_org_idempotency_uidx
  ON public.client_relationship_events (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_relationship_events_client_idx
  ON public.client_relationship_events (org_id, client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS message_logs_client_sent_idx
  ON public.message_logs (org_id, client_id, sent_at DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_intents_client_idx
  ON public.payment_intents (org_id, client_id, created_at DESC)
  WHERE client_id IS NOT NULL;

COMMENT ON TABLE public.client_relationship_events IS
  'Append-only CRM events that are not document Observe rows (notes, profile changes, manual interactions).';

CREATE OR REPLACE FUNCTION public.client_relationship_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'client_relationship_events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS client_relationship_events_no_update ON public.client_relationship_events;
CREATE TRIGGER client_relationship_events_no_update
  BEFORE UPDATE ON public.client_relationship_events
  FOR EACH ROW
  EXECUTE FUNCTION public.client_relationship_events_immutable();

DROP TRIGGER IF EXISTS client_relationship_events_no_delete ON public.client_relationship_events;
CREATE TRIGGER client_relationship_events_no_delete
  BEFORE DELETE ON public.client_relationship_events
  FOR EACH ROW
  EXECUTE FUNCTION public.client_relationship_events_immutable();

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_relationship_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_notes FROM anon;
REVOKE ALL ON TABLE public.client_relationship_events FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.client_notes TO authenticated;
GRANT SELECT, INSERT ON TABLE public.client_relationship_events TO authenticated;
GRANT ALL ON TABLE public.client_notes TO service_role;
GRANT ALL ON TABLE public.client_relationship_events TO service_role;

CREATE OR REPLACE FUNCTION public.is_client_timeline_editor(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = p_org_id
      AND o.owner_id = (SELECT auth.uid())
  ) OR EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.org_id = p_org_id
      AND m.user_id = (SELECT auth.uid())
      AND lower(COALESCE(m.role, '')) IN ('admin', 'manager', 'owner')
  );
$$;

DROP POLICY IF EXISTS "org members select client notes" ON public.client_notes;
CREATE POLICY "org members select client notes" ON public.client_notes
  FOR SELECT
  USING (public.is_client_timeline_editor(org_id));

DROP POLICY IF EXISTS "org members insert client notes" ON public.client_notes;
CREATE POLICY "org members insert client notes" ON public.client_notes
  FOR INSERT
  WITH CHECK (
    public.is_client_timeline_editor(org_id)
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_notes.client_id
        AND c.org_id = client_notes.org_id
    )
  );

DROP POLICY IF EXISTS "org members update client notes" ON public.client_notes;
CREATE POLICY "org members update client notes" ON public.client_notes
  FOR UPDATE
  USING (public.is_client_timeline_editor(org_id));

DROP POLICY IF EXISTS "org members select client relationship events" ON public.client_relationship_events;
CREATE POLICY "org members select client relationship events" ON public.client_relationship_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = client_relationship_events.org_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "org members insert client relationship events" ON public.client_relationship_events;
CREATE POLICY "org members insert client relationship events" ON public.client_relationship_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = client_relationship_events.org_id
        AND m.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_relationship_events.client_id
        AND c.org_id = client_relationship_events.org_id
    )
  );

CREATE OR REPLACE FUNCTION public.touch_client_last_activity(p_client_id uuid, p_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_client_id IS NULL OR p_at IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.clients
  SET last_activity_at = p_at
  WHERE id = p_client_id
    AND (last_activity_at IS NULL OR last_activity_at < p_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.document_events_touch_client_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.event_type IN (
    'sent', 'opened', 'accepted', 'rejected', 'paid', 'reminded', 'clicked',
    'overdue', 'payment_failed', 'payment_cancelled', 'payment_refunded',
    'converted_to_invoice'
  ) THEN
    PERFORM public.touch_client_last_activity(NEW.client_id, NEW.occurred_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_events_touch_client_activity ON public.document_events;
CREATE TRIGGER document_events_touch_client_activity
  AFTER INSERT ON public.document_events
  FOR EACH ROW
  EXECUTE FUNCTION public.document_events_touch_client_activity();

CREATE OR REPLACE FUNCTION public.client_relationship_events_touch_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.event_type IN (
    'client_created', 'client_updated', 'note_added',
    'follow_up_required', 'client_contacted', 'meeting_held', 'call_completed',
    'revision_requested', 'new_quote_requested', 'payment_extension_requested'
  ) THEN
    PERFORM public.touch_client_last_activity(NEW.client_id, NEW.occurred_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS client_relationship_events_touch_activity ON public.client_relationship_events;
CREATE TRIGGER client_relationship_events_touch_activity
  AFTER INSERT ON public.client_relationship_events
  FOR EACH ROW
  EXECUTE FUNCTION public.client_relationship_events_touch_activity();

CREATE OR REPLACE FUNCTION public.record_client_profile_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  changes jsonb := '[]'::jsonb;
  first_field text;
  first_from text;
  first_to text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_relationship_events (
      org_id, client_id, event_type, actor_type, source, occurred_at, idempotency_key, metadata
    ) VALUES (
      NEW.org_id,
      NEW.id,
      'client_created',
      'user',
      'client_record',
      COALESCE(NEW.created_at, now()),
      'client_created:' || NEW.id::text,
      jsonb_build_object('source', 'insert_trigger')
    )
    ON CONFLICT DO NOTHING;
    PERFORM public.touch_client_last_activity(NEW.id, COALESCE(NEW.created_at, now()));
    RETURN NEW;
  END IF;

  IF NEW.name IS DISTINCT FROM OLD.name THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','name','from',OLD.name,'to',NEW.name));
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','email','from',OLD.email,'to',NEW.email));
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','phone','from',OLD.phone,'to',NEW.phone));
  END IF;
  IF NEW.address IS DISTINCT FROM OLD.address THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','address','from',OLD.address,'to',NEW.address));
  END IF;
  IF NEW.contact_person IS DISTINCT FROM OLD.contact_person THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','contact_person','from',OLD.contact_person,'to',NEW.contact_person));
  END IF;
  IF NEW.website IS DISTINCT FROM OLD.website THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','website','from',OLD.website,'to',NEW.website));
  END IF;
  IF NEW.tax_id IS DISTINCT FROM OLD.tax_id THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','tax_id','from',OLD.tax_id,'to',NEW.tax_id));
  END IF;
  IF NEW.alternate_email IS DISTINCT FROM OLD.alternate_email THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','alternate_email','from',OLD.alternate_email,'to',NEW.alternate_email));
  END IF;
  IF NEW.payment_terms IS DISTINCT FROM OLD.payment_terms OR NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days THEN
    changes := changes || jsonb_build_array(jsonb_build_object(
      'field','payment_terms',
      'from', COALESCE(OLD.payment_terms, '') || CASE WHEN OLD.payment_terms_days IS NOT NULL THEN ' (' || OLD.payment_terms_days::text || ' days)' ELSE '' END,
      'to', COALESCE(NEW.payment_terms, '') || CASE WHEN NEW.payment_terms_days IS NOT NULL THEN ' (' || NEW.payment_terms_days::text || ' days)' ELSE '' END
    ));
  END IF;
  IF NEW.segment IS DISTINCT FROM OLD.segment THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','segment','from',OLD.segment,'to',NEW.segment));
  END IF;
  IF NEW.industry IS DISTINCT FROM OLD.industry THEN
    changes := changes || jsonb_build_array(jsonb_build_object('field','industry','from',OLD.industry,'to',NEW.industry));
  END IF;

  IF jsonb_array_length(changes) = 0 THEN
    RETURN NEW;
  END IF;

  first_field := changes->0->>'field';
  first_from := changes->0->>'from';
  first_to := changes->0->>'to';

  INSERT INTO public.client_relationship_events (
    org_id, client_id, event_type, actor_type, source, occurred_at, metadata
  ) VALUES (
    NEW.org_id,
    NEW.id,
    'client_updated',
    'user',
    'client_record',
    now(),
    jsonb_build_object(
      'source', 'update_trigger',
      'field', first_field,
      'from', first_from,
      'to', first_to,
      'changed_fields', changes
    )
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NEW;
  WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_record_timeline ON public.clients;
CREATE TRIGGER clients_record_timeline
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.record_client_profile_timeline();

-- Reliable backfill: created Observe events for existing commercial docs.
INSERT INTO public.document_events (
  org_id, document_id, source_kind, source_id, document_type, event_type,
  payload, actor_type, client_id, occurred_at, idempotency_key
)
SELECT
  i.org_id, NULL, 'invoice', i.id, 'invoice', 'created',
  jsonb_build_object('source', 'history_backfill'),
  'system', i.client_id, COALESCE(i.created_at, now()),
  'created:invoice:' || i.id::text
FROM public.invoices i
WHERE i.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.document_events (
  org_id, document_id, source_kind, source_id, document_type, event_type,
  payload, actor_type, client_id, occurred_at, idempotency_key
)
SELECT
  q.org_id, NULL, 'quote', q.id, 'quote', 'created',
  jsonb_build_object('source', 'history_backfill'),
  'system', q.client_id, COALESCE(q.created_at, now()),
  'created:quote:' || q.id::text
FROM public.quotes q
WHERE q.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.document_events (
  org_id, document_id, source_kind, source_id, document_type, event_type,
  payload, actor_type, client_id, occurred_at, idempotency_key, payment_intent_id
)
SELECT
  p.org_id, NULL, 'invoice', p.invoice_id, 'invoice', 'paid',
  jsonb_build_object(
    'source', 'history_backfill',
    'payment_id', p.id,
    'payment_reference', p.reference,
    'amount', p.amount,
    'provider', p.method
  ),
  'payment_gateway',
  p.client_id,
  COALESCE(p.paid_at, p.created_at, now()),
  'paid:invoice:' || p.invoice_id::text || ':' || p.id::text,
  NULL
FROM public.payments p
WHERE p.org_id IS NOT NULL
  AND p.invoice_id IS NOT NULL
  AND (p.status IS NULL OR p.status IN ('paid', 'completed', 'success') OR p.paid_at IS NOT NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.document_events (
  org_id, document_id, source_kind, source_id, document_type, event_type,
  payload, actor_type, client_id, occurred_at, idempotency_key
)
SELECT
  ml.org_id, NULL,
  CASE WHEN lower(COALESCE(ml.document_type, '')) = 'quote' THEN 'quote' ELSE 'invoice' END,
  ml.document_id,
  CASE WHEN lower(COALESCE(ml.document_type, '')) = 'quote' THEN 'quote' ELSE 'invoice' END,
  'sent',
  jsonb_build_object(
    'source', 'history_backfill',
    'channel', ml.channel,
    'tracking_token', ml.tracking_token,
    'recipient', ml.recipient
  ),
  'user',
  ml.client_id,
  COALESCE(ml.sent_at, ml.created_at, now()),
  CASE
    WHEN ml.tracking_token IS NOT NULL AND length(ml.tracking_token) > 0
      THEN 'sent:' || CASE WHEN lower(COALESCE(ml.document_type, '')) = 'quote' THEN 'quote' ELSE 'invoice' END || ':' || ml.document_id::text || ':' || ml.tracking_token
    ELSE 'sent:' || CASE WHEN lower(COALESCE(ml.document_type, '')) = 'quote' THEN 'quote' ELSE 'invoice' END || ':' || ml.document_id::text || ':msglog:' || ml.id::text
  END
FROM public.message_logs ml
WHERE ml.org_id IS NOT NULL
  AND ml.document_id IS NOT NULL
  AND lower(COALESCE(ml.document_type, 'invoice')) IN ('invoice', 'quote')
ON CONFLICT DO NOTHING;

INSERT INTO public.client_relationship_events (
  org_id, client_id, event_type, actor_type, source, occurred_at, idempotency_key, metadata
)
SELECT
  c.org_id, c.id, 'client_created', 'system', 'history_backfill',
  COALESCE(c.created_at, now()),
  'client_created:' || c.id::text,
  jsonb_build_object('source', 'history_backfill')
FROM public.clients c
WHERE c.org_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.client_notes (org_id, client_id, body, created_at, updated_at)
SELECT c.org_id, c.id, btrim(c.internal_notes), COALESCE(c.updated_at, c.created_at, now()), COALESCE(c.updated_at, now())
FROM public.clients c
WHERE c.org_id IS NOT NULL
  AND c.internal_notes IS NOT NULL
  AND length(btrim(c.internal_notes)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.client_notes n
    WHERE n.client_id = c.id AND n.org_id = c.org_id
  );

INSERT INTO public.client_relationship_events (
  org_id, client_id, event_type, actor_type, source, note_id, occurred_at, idempotency_key, metadata
)
SELECT
  n.org_id, n.client_id, 'note_added', 'user', 'history_backfill', n.id, n.created_at,
  'note_added:' || n.id::text,
  jsonb_build_object('source', 'history_backfill', 'note_id', n.id, 'preview', left(n.body, 180))
FROM public.client_notes n
ON CONFLICT DO NOTHING;

UPDATE public.clients c
SET last_activity_at = GREATEST(
  COALESCE(c.last_activity_at, c.created_at),
  c.created_at,
  (
    SELECT max(e.occurred_at)
    FROM public.document_events e
    WHERE e.client_id = c.id
      AND e.event_type IN (
        'sent', 'opened', 'accepted', 'rejected', 'paid', 'reminded', 'clicked',
        'overdue', 'payment_failed', 'payment_cancelled', 'payment_refunded',
        'converted_to_invoice'
      )
  ),
  (
    SELECT max(r.occurred_at)
    FROM public.client_relationship_events r
    WHERE r.client_id = c.id
  )
)
WHERE c.org_id IS NOT NULL;
