-- Document Engine: payslips join document_events Observe without invoice/quote lifecycles.
-- Additive. Client timeline remains invoice|quote only.

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_source_kind_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_source_kind_check
  CHECK (source_kind IN ('hub', 'invoice', 'quote', 'payslip'));

ALTER TABLE public.document_events
  DROP CONSTRAINT IF EXISTS document_events_shape_check;

ALTER TABLE public.document_events
  ADD CONSTRAINT document_events_shape_check
  CHECK (
    (source_kind = 'hub' AND document_id IS NOT NULL)
    OR (source_kind IN ('invoice', 'quote', 'payslip') AND source_id IS NOT NULL AND document_id IS NULL)
  );

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
    OR (
      source_kind = 'payslip'
      AND event_type IN (
        'created', 'sent', 'delivered', 'opened', 'clicked', 'downloaded',
        'failed', 'bounced'
      )
    )
  );

DROP POLICY IF EXISTS "org members select document events" ON public.document_events;
CREATE POLICY "org members select document events" ON public.document_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = document_events.org_id
        AND m.user_id = (SELECT auth.uid())
    )
    AND (
      source_kind <> 'payslip'
      OR public.is_admin()
      OR public.is_payroll_admin_for_org(document_events.org_id)
      OR EXISTS (
        SELECT 1 FROM public.payslips p
        WHERE p.id = document_events.source_id
          AND p.org_id = document_events.org_id
          AND p.employee_user_id = (SELECT auth.uid())
      )
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
      OR (
        source_kind = 'payslip'
        AND source_id IS NOT NULL
        AND client_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.payslips p
          WHERE p.id = document_events.source_id
            AND p.org_id = document_events.org_id
        )
        AND (
          public.is_admin()
          OR public.is_payroll_admin_for_org(document_events.org_id)
          OR EXISTS (
            SELECT 1 FROM public.payslips p
            WHERE p.id = document_events.source_id
              AND p.org_id = document_events.org_id
              AND p.employee_user_id = (SELECT auth.uid())
          )
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.record_payslip_document_created()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.document_events (
    org_id, document_id, source_kind, source_id, document_type, event_type,
    payload, actor_type, client_id, occurred_at, idempotency_key
  ) VALUES (
    NEW.org_id,
    NULL,
    'payslip',
    NEW.id,
    'payslip',
    'created',
    jsonb_build_object('source', 'insert_trigger'),
    'system',
    NULL,
    now(),
    'created:payslip:' || NEW.id::text
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

DROP TRIGGER IF EXISTS payslips_record_created_event ON public.payslips;
CREATE TRIGGER payslips_record_created_event
  AFTER INSERT ON public.payslips
  FOR EACH ROW
  EXECUTE FUNCTION public.record_payslip_document_created();

COMMENT ON FUNCTION public.record_payslip_document_created() IS
  'Append-only payslip created event. Payroll figures stay on payslips; never copy net_pay into payload.';
