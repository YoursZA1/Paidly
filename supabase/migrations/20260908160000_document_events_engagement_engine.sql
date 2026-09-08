-- Expand document_events into the Observe timeline for hub + commercial docs.
-- Additive: existing hub rows stay valid. Events are append-only.

ALTER TABLE public.document_events
  ALTER COLUMN document_id DROP NOT NULL;

ALTER TABLE public.document_events
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actor_type text,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payment_intent_id uuid;

UPDATE public.document_events
SET
  source_kind = COALESCE(source_kind, 'hub'),
  source_id = COALESCE(source_id, document_id),
  actor_type = COALESCE(actor_type, 'user'),
  occurred_at = COALESCE(occurred_at, created_at)
WHERE source_kind IS NULL OR source_id IS NULL OR occurred_at IS NULL OR actor_type IS NULL;

ALTER TABLE public.document_events
  ALTER COLUMN source_kind SET DEFAULT 'hub',
  ALTER COLUMN actor_type SET DEFAULT 'system',
  ALTER COLUMN occurred_at SET DEFAULT now();

ALTER TABLE public.document_events
  ALTER COLUMN source_kind SET NOT NULL,
  ALTER COLUMN occurred_at SET NOT NULL;

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_source_kind_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_source_kind_check
  CHECK (source_kind IN ('hub', 'invoice', 'quote'));

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_actor_type_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_actor_type_check
  CHECK (actor_type IN ('system', 'user', 'recipient', 'webhook'));

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_shape_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_shape_check
  CHECK (
    (source_kind = 'hub' AND document_id IS NOT NULL)
    OR (source_kind IN ('invoice', 'quote') AND source_id IS NOT NULL AND document_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS document_events_org_idempotency_uidx
  ON public.document_events (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_events_source_idx
  ON public.document_events (org_id, source_kind, source_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS document_events_type_occurred_idx
  ON public.document_events (org_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS document_events_client_idx
  ON public.document_events (org_id, client_id, occurred_at DESC)
  WHERE client_id IS NOT NULL;

COMMENT ON TABLE public.document_events IS
  'Immutable Observe timeline. Not the source of truth for document/payment status.';

CREATE OR REPLACE FUNCTION public.document_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'document_events are immutable';
END;
$$;

DROP TRIGGER IF EXISTS document_events_no_update ON public.document_events;
CREATE TRIGGER document_events_no_update
  BEFORE UPDATE ON public.document_events
  FOR EACH ROW
  EXECUTE FUNCTION public.document_events_immutable();

DROP TRIGGER IF EXISTS document_events_no_delete ON public.document_events;
CREATE TRIGGER document_events_no_delete
  BEFORE DELETE ON public.document_events
  FOR EACH ROW
  EXECUTE FUNCTION public.document_events_immutable();

DROP POLICY IF EXISTS "org members select document events" ON public.document_events;
CREATE POLICY "org members select document events" ON public.document_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = document_events.org_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "org members insert document events" ON public.document_events;
CREATE POLICY "org members insert document events" ON public.document_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = document_events.org_id
        AND m.user_id = (SELECT auth.uid())
    )
    AND (
      (
        source_kind = 'hub'
        AND document_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.documents d
          WHERE d.id = document_events.document_id
            AND d.org_id = document_events.org_id
        )
      )
      OR (
        source_kind = 'invoice'
        AND source_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.invoices i
          WHERE i.id = document_events.source_id
            AND i.org_id = document_events.org_id
        )
      )
      OR (
        source_kind = 'quote'
        AND source_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.quotes q
          WHERE q.id = document_events.source_id
            AND q.org_id = document_events.org_id
        )
      )
    )
  );

DROP POLICY IF EXISTS "org members delete document events" ON public.document_events;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS reminder_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.reminder_settings IS
  'Business-level invoice reminder rules. Empty object falls back to profile defaults.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'document_sends_channel_check'
      AND conrelid = 'public.document_sends'::regclass
  ) THEN
    ALTER TABLE public.document_sends DROP CONSTRAINT document_sends_channel_check;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

ALTER TABLE public.document_sends
  DROP CONSTRAINT IF EXISTS document_sends_channel_check;

DO $$
BEGIN
  ALTER TABLE public.document_sends
    ADD CONSTRAINT document_sends_channel_check
    CHECK (channel IN ('email', 'whatsapp', 'remind'));
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;
