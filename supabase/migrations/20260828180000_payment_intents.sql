-- Canonical Payment Intent layer (Document Engine / POS ↔ customer payment rails).
-- PayFast is SaaS subscription billing only — it must not appear as a customer-payment provider.
-- POS settlement remains pos_sales_events (not invoice payments, not payment_history).
-- Safe in SQL Editor: uses gen_random_uuid(); FKs to optional tables are added only when those relations exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('document', 'pos')),
  document_id uuid,
  document_type text,
  pos_sale_event_id uuid,
  provider text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'requires_action', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded')
  ),
  external_id text,
  idempotency_key text,
  client_id uuid,
  company_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_pos_provider_check CHECK (
    (source_kind = 'pos' AND provider IN ('cash', 'ozow'))
    OR (source_kind = 'document' AND provider IN ('ozow'))
  ),
  CONSTRAINT payment_intents_document_ref_check CHECK (
    source_kind <> 'document' OR document_id IS NOT NULL
  )
);

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_pos_sale_event_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.payment_intents
        ADD CONSTRAINT payment_intents_pos_sale_event_id_fkey
        FOREIGN KEY (pos_sale_event_id) REFERENCES public.pos_sales_events(id) ON DELETE SET NULL
    $c$;
  ELSE
    RAISE NOTICE 'pos_sales_events missing — skip payment_intents.pos_sale_event_id FK (run scripts/apply-pos-integrations.sql)';
  END IF;

  IF to_regclass('public.clients') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_client_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.payment_intents
        ADD CONSTRAINT payment_intents_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL
    $c$;
  END IF;

  IF to_regclass('public.companies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_intents DROP CONSTRAINT IF EXISTS payment_intents_company_id_fkey';
    EXECUTE $c$
      ALTER TABLE public.payment_intents
        ADD CONSTRAINT payment_intents_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL
    $c$;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_org_idempotency
  ON public.payment_intents (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_intents_org_created
  ON public.payment_intents (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_intents_pos_sale
  ON public.payment_intents (pos_sale_event_id)
  WHERE pos_sale_event_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.pos_sales_events') IS NULL THEN
    RAISE NOTICE 'pos_sales_events missing — skip payment_intent_id column';
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pos_sales_events ADD COLUMN IF NOT EXISTS payment_intent_id uuid';
  EXECUTE 'ALTER TABLE public.pos_sales_events DROP CONSTRAINT IF EXISTS pos_sales_events_payment_intent_id_fkey';
  EXECUTE $c$
    ALTER TABLE public.pos_sales_events
      ADD CONSTRAINT pos_sales_events_payment_intent_id_fkey
      FOREIGN KEY (payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE SET NULL
  $c$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_pos_sales_events_payment_intent ON public.pos_sales_events (payment_intent_id) WHERE payment_intent_id IS NOT NULL';
  EXECUTE $c$
    COMMENT ON COLUMN public.pos_sales_events.payment_intent_id IS
      'Intent that verified this till sale. Cash and Ozow go through payment_intents first.'
  $c$;
END $$;

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_intents_org_select" ON public.payment_intents;
CREATE POLICY "payment_intents_org_select"
  ON public.payment_intents
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

GRANT ALL ON TABLE public.payment_intents TO service_role;
GRANT SELECT ON TABLE public.payment_intents TO authenticated;

COMMENT ON TABLE public.payment_intents IS
  'Customer payment handoff. source_kind=pos settles to pos_sales_events; source_kind=document settles to invoice payments. PayFast is not a provider here.';
COMMENT ON COLUMN public.payment_intents.provider IS
  'Customer rail: cash (till-verified) or ozow (online). Never payfast.';
