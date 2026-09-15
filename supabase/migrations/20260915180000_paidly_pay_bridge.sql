-- Paidly Pay bridge: API keys, devices, provider event idempotency, refund requests.
-- Does not duplicate payment_intents or pos_sales_events.
-- Safe in SQL Editor. Service-role only for secrets.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.paidly_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  key_id text NOT NULL,
  secret_hash text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  scopes text[] NOT NULL DEFAULT ARRAY[
    'transactions:read',
    'payments:create',
    'payments:read',
    'payments:cancel',
    'payments:refund',
    'devices:manage'
  ]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paidly_api_keys_key_id
  ON public.paidly_api_keys (key_id);

CREATE INDEX IF NOT EXISTS idx_paidly_api_keys_org
  ON public.paidly_api_keys (org_id, status);

ALTER TABLE public.paidly_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paidly_api_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paidly_api_keys TO service_role;

COMMENT ON TABLE public.paidly_api_keys IS
  'Hashed Paidly Pay API keys. Raw secrets never stored. Server-side lookup only.';

CREATE TABLE IF NOT EXISTS public.paidly_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_name text NOT NULL DEFAULT 'Paidly Pay',
  platform text,
  os_version text,
  app_version text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paidly_devices_org
  ON public.paidly_devices (org_id, status);

ALTER TABLE public.paidly_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paidly_devices FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paidly_devices TO service_role;

COMMENT ON TABLE public.paidly_devices IS
  'Paidly Pay terminal devices. Revoked devices cannot create payment intents.';

CREATE TABLE IF NOT EXISTS public.payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payment_intent_id uuid REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_provider_events_org_event
  ON public.payment_provider_events (org_id, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_intent
  ON public.payment_provider_events (payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_provider_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.payment_provider_events TO service_role;

COMMENT ON TABLE public.payment_provider_events IS
  'Idempotency ledger for verified payment-provider webhooks. Duplicate event ids do not settle twice.';

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  provider_refund_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_intent
  ON public.payment_refunds (payment_intent_id, created_at DESC);

ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_refunds_org_select" ON public.payment_refunds;
CREATE POLICY "payment_refunds_org_select"
  ON public.payment_refunds
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

GRANT ALL ON TABLE public.payment_refunds TO service_role;
GRANT SELECT ON TABLE public.payment_refunds TO authenticated;

COMMENT ON TABLE public.payment_refunds IS
  'Provider refund requests. payment_intents.status becomes refunded only after a verified provider event.';
