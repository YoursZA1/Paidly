-- Paidly subscription billing v2 — schema foundation (Revenue System).
-- Extends live PayFast ITN surface; does NOT rename/drop columns used by
-- payfast_itn_replace_user_subscription / payfastSubscriptionItn.js.
--
-- Tables:
--   plans                      — SaaS catalog SoR (React must load from DB / API; not hardcode)
--   subscriptions              — agreement rows (+ pending checkout, plan_id, canonical status)
--   payment_history            — every SaaS transaction (append-only; never delete)
--   subscription_events        — every billing action (append-only)
--   payfast_itn_logs           — raw ITN + verification flags (never trust; save everything)
--   subscription_invoices      — SaaS tax invoices after verified payment (≠ Document Engine invoices)
--   webhook_logs               — inbound/outbound webhook debug (provider, headers, body, response)
--
-- Status vocabulary (subscriptions.status) — ALLOWED ONLY (never invent):
--   pending | processing | active | past_due | failed | cancelled | expired | suspended | trialing
--
-- payment_history.payment_status — ALLOWED ONLY:
--   pending | completed | failed | cancelled | refunded
--
-- subscription_invoices.status — ALLOWED ONLY:
--   draft | paid | void | cancelled

-- ── 1. Plans catalog (Phase 1.1) ─────────────────────────────────────────────
-- Amounts/names/features live here. SPA and Vercel must read plans via Supabase
-- or a backend endpoint — never hardcode prices in React for checkout.

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  billing_cycle text NOT NULL
    CHECK (billing_cycle IN ('monthly', 'annual', 'quarterly', 'biannual')),
  amount numeric(10, 2) NOT NULL CHECK (amount >= 0),
  currency text DEFAULT 'ZAR',
  payfast_item_name text,
  features jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT plans_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]*$')
);

COMMENT ON TABLE public.plans IS
  'SaaS plan catalog SoR. Distinct from public.packages. UI/checkout must load rows from DB/API — do not hardcode amounts in React.';

COMMENT ON COLUMN public.plans.amount IS
  'Charge amount in plans.currency (ZAR). Server verifies PayFast ITN against this.';
COMMENT ON COLUMN public.plans.payfast_item_name IS
  'item_name sent to PayFast checkout; defaults to name when null.';
COMMENT ON COLUMN public.plans.active IS
  'When false, hidden from public catalog; admins may still read.';

CREATE INDEX IF NOT EXISTS plans_active_created_idx
  ON public.plans (active, created_at);

INSERT INTO public.plans (
  slug, name, description, billing_cycle, amount, currency, payfast_item_name, features, active
)
VALUES
  (
    'individual',
    'Individual',
    'Solo operators and side projects.',
    'monthly',
    25.00,
    'ZAR',
    'Paidly Individual',
    '["invoices","clients","email","basic_reports"]'::jsonb,
    true
  ),
  (
    'sme',
    'SME',
    'Small teams that need more control.',
    'monthly',
    50.00,
    'ZAR',
    'Paidly SME',
    '["invoices","clients","email","basic_reports","quotes","templates"]'::jsonb,
    true
  ),
  (
    'corporate',
    'Corporate',
    'Growing businesses with heavier volume.',
    'monthly',
    110.00,
    'ZAR',
    'Paidly Corporate',
    '["invoices","clients","email","basic_reports","quotes","templates","advanced_reports"]'::jsonb,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  billing_cycle = EXCLUDED.billing_cycle,
  amount = EXCLUDED.amount,
  currency = EXCLUDED.currency,
  payfast_item_name = EXCLUDED.payfast_item_name,
  features = EXCLUDED.features,
  active = EXCLUDED.active;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Public + authenticated catalog (pricing / upgrade UI). Writes: admin only.
-- Do not call is_admin() in the anon path (EXECUTE not granted to anon).
DROP POLICY IF EXISTS "plans_public_select_active" ON public.plans;
CREATE POLICY "plans_public_select_active"
  ON public.plans
  FOR SELECT
  TO anon, authenticated
  USING (active IS TRUE);

DROP POLICY IF EXISTS "plans_admin_select_all" ON public.plans;
CREATE POLICY "plans_admin_select_all"
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;
CREATE POLICY "plans_admin_write"
  ON public.plans
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;

-- ── 2. Normalize legacy status → allowed vocabulary (no invented values) ──────

-- Legacy American / aliases → canonical allowed statuses
UPDATE public.subscriptions
SET status = 'cancelled',
    updated_at = now()
WHERE lower(trim(status)) IN ('canceled', 'cancel', 'inactive');

UPDATE public.subscriptions
SET status = 'suspended',
    updated_at = now()
WHERE lower(trim(status)) = 'paused';

UPDATE public.subscriptions
SET status = 'trialing',
    updated_at = now()
WHERE lower(trim(status)) = 'trial';

UPDATE public.subscriptions
SET status = 'cancelled',
    updated_at = now()
WHERE status IS NULL OR btrim(status) = '';

-- Any remaining unknown free-text → cancelled (terminal; do not invent new labels)
UPDATE public.subscriptions
SET status = 'cancelled',
    updated_at = now()
WHERE lower(trim(status)) NOT IN (
  'pending',
  'processing',
  'active',
  'past_due',
  'failed',
  'cancelled',
  'expired',
  'suspended',
  'trialing'
);

-- ── 3. subscriptions — Phase 1.2 core shape (extend live table) ───────────────
-- Target core (additive; does not DROP legacy ITN columns):
--   id, company_id, plan_id, payfast_token, payfast_subscription_id,
--   payfast_payment_id, status, started_at, current_period_start,
--   current_period_end, cancelled_at, expires_at, next_billing_date,
--   trial_ends_at, created_by, created_at, updated_at
-- Retained for PayFast ITN / RPC compatibility:
--   user_id, email, plan, current_plan, amount, start_date, canceled_at, …

COMMENT ON TABLE public.subscriptions IS
  'SaaS subscription agreements (SoR for access). Activate only after verified PayFast ITN. Legacy admin/ITN columns retained.';

-- Core FKs / PayFast ids
-- Product company_id = organizations.id (tenant). Not multi-brand public.companies.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payfast_token text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payfast_subscription_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payfast_payment_id text;

-- Lifecycle timestamps (Phase 1.2)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS next_billing_date timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Checkout / ITN correlation (not in core DDL; required for pending → PayFast → ITN)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_slug text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'ZAR';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS m_payment_id text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pending_expires_at timestamptz;

COMMENT ON COLUMN public.subscriptions.company_id IS
  'Tenant org id (product company_id). RLS: users see rows where company_id = current_company_id().';
COMMENT ON COLUMN public.subscriptions.plan_id IS
  'FK to plans catalog; amounts must be read from plans, not hardcoded in React.';
COMMENT ON COLUMN public.subscriptions.payfast_token IS
  'PayFast recurring token from verified ITN.';
COMMENT ON COLUMN public.subscriptions.payfast_subscription_id IS
  'PayFast subscription identifier when distinct from token.';
COMMENT ON COLUMN public.subscriptions.payfast_payment_id IS
  'Latest verified PayFast pf_payment_id for this agreement.';
COMMENT ON COLUMN public.subscriptions.status IS
  'Allowed only: pending|processing|active|past_due|failed|cancelled|expired|suspended|trialing. Never set active from the frontend.';
COMMENT ON COLUMN public.subscriptions.started_at IS
  'Agreement start (set on first verified activation).';
COMMENT ON COLUMN public.subscriptions.current_period_start IS
  'Start of the current billing period.';
COMMENT ON COLUMN public.subscriptions.current_period_end IS
  'End of the current billing period.';
COMMENT ON COLUMN public.subscriptions.cancelled_at IS
  'Phase 1.2 cancel timestamp. Kept in sync with legacy canceled_at for ITN RPC.';
COMMENT ON COLUMN public.subscriptions.expires_at IS
  'Hard end of access when cancel-at-period-end or term expiry applies.';
COMMENT ON COLUMN public.subscriptions.next_billing_date IS
  'Next scheduled PayFast / provider charge.';
COMMENT ON COLUMN public.subscriptions.trial_ends_at IS
  'Trial end on this agreement (distinct from profiles.trial_ends_at cache).';
COMMENT ON COLUMN public.subscriptions.created_by IS
  'Auth user who started checkout / created the pending row.';
COMMENT ON COLUMN public.subscriptions.m_payment_id IS
  'PayFast m_payment_id for pending checkout correlation.';
COMMENT ON COLUMN public.subscriptions.activated_at IS
  'Set only after server-side ITN verification (never from frontend).';
COMMENT ON COLUMN public.subscriptions.pending_expires_at IS
  'Abandon pending checkout after this timestamp if no ITN.';

-- Backfill core columns from legacy ITN / admin fields
UPDATE public.subscriptions
SET created_by = user_id
WHERE created_by IS NULL AND user_id IS NOT NULL;

UPDATE public.subscriptions
SET started_at = coalesce(started_at, start_date, activated_at)
WHERE started_at IS NULL
  AND (start_date IS NOT NULL OR activated_at IS NOT NULL);

UPDATE public.subscriptions
SET cancelled_at = canceled_at
WHERE cancelled_at IS NULL AND canceled_at IS NOT NULL;

UPDATE public.subscriptions
SET canceled_at = cancelled_at
WHERE canceled_at IS NULL AND cancelled_at IS NOT NULL;

-- Mirror alias used by earlier draft of this migration / app helpers
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_pf_payment_id text;

UPDATE public.subscriptions
SET last_pf_payment_id = payfast_payment_id
WHERE last_pf_payment_id IS NULL AND payfast_payment_id IS NOT NULL;

UPDATE public.subscriptions
SET payfast_payment_id = last_pf_payment_id
WHERE payfast_payment_id IS NULL AND last_pf_payment_id IS NOT NULL;

UPDATE public.subscriptions s
SET plan_slug = CASE
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) IN ('individual', 'basic', 'starter', 'trial')
    THEN 'individual'
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) IN ('sme', 'professional', 'pro')
    THEN 'sme'
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) IN ('corporate', 'enterprise')
    THEN 'corporate'
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) LIKE '%individual%'
    THEN 'individual'
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) LIKE '%sme%'
    THEN 'sme'
  WHEN lower(trim(coalesce(s.current_plan, s.plan, ''))) LIKE '%corporate%'
    OR lower(trim(coalesce(s.current_plan, s.plan, ''))) LIKE '%enterprise%'
    THEN 'corporate'
  ELSE NULL
END
WHERE s.plan_slug IS NULL;

UPDATE public.subscriptions s
SET plan_id = p.id
FROM public.plans p
WHERE s.plan_id IS NULL
  AND s.plan_slug IS NOT NULL
  AND p.slug = s.plan_slug;

CREATE INDEX IF NOT EXISTS subscriptions_company_id_idx
  ON public.subscriptions (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx
  ON public.subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS subscriptions_plan_slug_idx
  ON public.subscriptions (plan_slug);

CREATE INDEX IF NOT EXISTS subscriptions_created_by_idx
  ON public.subscriptions (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_payfast_payment_id_idx
  ON public.subscriptions (payfast_payment_id)
  WHERE payfast_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_m_payment_id_idx
  ON public.subscriptions (m_payment_id)
  WHERE m_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_status_period_end_idx
  ON public.subscriptions (status, current_period_end);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_pending_unique
  ON public.subscriptions (user_id)
  WHERE status = 'pending' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_company_pending_unique
  ON public.subscriptions (company_id)
  WHERE status = 'pending' AND company_id IS NOT NULL;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_allowed;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_allowed
  CHECK (
    status IS NULL
    OR status IN (
      'pending',
      'processing',
      'active',
      'past_due',
      'failed',
      'cancelled',
      'expired',
      'suspended',
      'trialing'
    )
  );

CREATE OR REPLACE FUNCTION public.normalize_subscription_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
    RAISE EXCEPTION 'subscriptions.status is required (allowed: pending, processing, active, past_due, failed, cancelled, expired, suspended, trialing)';
  END IF;

  NEW.status := lower(trim(NEW.status));

  -- Map legacy writers (PayFast ITN / older admin) → allowed vocabulary only
  IF NEW.status IN ('canceled', 'cancel', 'inactive') THEN
    NEW.status := 'cancelled';
  ELSIF NEW.status = 'paused' THEN
    NEW.status := 'suspended';
  ELSIF NEW.status = 'trial' THEN
    NEW.status := 'trialing';
  END IF;

  IF NEW.status NOT IN (
    'pending',
    'processing',
    'active',
    'past_due',
    'failed',
    'cancelled',
    'expired',
    'suspended',
    'trialing'
  ) THEN
    RAISE EXCEPTION 'invalid subscriptions.status "%" — allowed: pending, processing, active, past_due, failed, cancelled, expired, suspended, trialing',
      NEW.status;
  END IF;

  IF NEW.status IN ('active', 'trialing') THEN
    IF NEW.activated_at IS NULL AND NEW.status = 'active' THEN
      NEW.activated_at := now();
    END IF;
    IF NEW.started_at IS NULL THEN
      NEW.started_at := coalesce(NEW.start_date, NEW.activated_at, now());
    END IF;
  END IF;

  IF NEW.status = 'cancelled'
     AND NEW.cancelled_at IS NULL
     AND NEW.canceled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;

  -- Keep Phase 1.2 cancelled_at and legacy ITN canceled_at aligned
  IF TG_OP = 'UPDATE' THEN
    IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      NEW.canceled_at := NEW.cancelled_at;
    ELSIF NEW.canceled_at IS DISTINCT FROM OLD.canceled_at THEN
      NEW.cancelled_at := NEW.canceled_at;
    ELSE
      NEW.canceled_at := coalesce(NEW.canceled_at, NEW.cancelled_at);
      NEW.cancelled_at := coalesce(NEW.cancelled_at, NEW.canceled_at);
    END IF;
  ELSE
    NEW.canceled_at := coalesce(NEW.canceled_at, NEW.cancelled_at);
    NEW.cancelled_at := coalesce(NEW.cancelled_at, NEW.canceled_at);
  END IF;

  IF NEW.created_by IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.created_by := NEW.user_id;
  END IF;

  NEW.last_pf_payment_id := coalesce(NEW.payfast_payment_id, NEW.last_pf_payment_id);
  NEW.payfast_payment_id := coalesce(NEW.payfast_payment_id, NEW.last_pf_payment_id);

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_status ON public.subscriptions;
CREATE TRIGGER trg_normalize_subscription_status
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_subscription_status();

-- ── 4. payment_history — every SaaS transaction (Phase 1.3) ───────────────────
-- Never delete rows. Distinct from public.payments (invoice settlements).

CREATE TABLE IF NOT EXISTS public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payfast_payment_id text,
  amount numeric(10, 2),
  currency text DEFAULT 'ZAR',
  payment_status text
    CHECK (
      payment_status IS NULL
      OR payment_status IN (
        'pending',
        'completed',
        'failed',
        'cancelled',
        'refunded'
      )
    ),
  payment_method text,
  transaction_date timestamptz,
  raw_itn jsonb,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.payment_history IS
  'Append-only SaaS payment ledger (every transaction). NEVER delete rows. Activate subscription only after a verified completed row from ITN. Distinct from public.payments (invoice settlements).';

COMMENT ON COLUMN public.payment_history.payment_status IS
  'Allowed only: pending | completed | failed | cancelled | refunded. PayFast COMPLETE → completed.';
COMMENT ON COLUMN public.payment_history.raw_itn IS
  'Full verified PayFast ITN payload for audit / dispute.';

CREATE UNIQUE INDEX IF NOT EXISTS payment_history_payfast_payment_id_uidx
  ON public.payment_history (payfast_payment_id)
  WHERE payfast_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_history_subscription_created_idx
  ON public.payment_history (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_history_company_created_idx
  ON public.payment_history (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_history_status_created_idx
  ON public.payment_history (payment_status, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_history_transaction_date_idx
  ON public.payment_history (transaction_date DESC NULLS LAST);

-- Coerce PayFast / legacy payment_status → allow-list
CREATE OR REPLACE FUNCTION public.normalize_payment_history_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_status IS NOT NULL AND btrim(NEW.payment_status) <> '' THEN
    NEW.payment_status := lower(trim(NEW.payment_status));
    IF NEW.payment_status IN ('complete', 'completed', 'success', 'successful') THEN
      NEW.payment_status := 'completed';
    ELSIF NEW.payment_status IN ('fail', 'failed', 'error') THEN
      NEW.payment_status := 'failed';
    ELSIF NEW.payment_status IN ('cancel', 'canceled', 'cancelled') THEN
      NEW.payment_status := 'cancelled';
    ELSIF NEW.payment_status IN ('refund', 'refunded') THEN
      NEW.payment_status := 'refunded';
    ELSIF NEW.payment_status IN ('pending', 'processing') THEN
      NEW.payment_status := 'pending';
    END IF;

    IF NEW.payment_status NOT IN (
      'pending', 'completed', 'failed', 'cancelled', 'refunded'
    ) THEN
      RAISE EXCEPTION
        'invalid payment_history.payment_status "%" — allowed: pending, completed, failed, cancelled, refunded',
        NEW.payment_status;
    END IF;
  END IF;

  IF NEW.transaction_date IS NULL THEN
    NEW.transaction_date := now();
  END IF;

  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    NEW.currency := 'ZAR';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_payment_history_status ON public.payment_history;
CREATE TRIGGER trg_normalize_payment_history_status
  BEFORE INSERT OR UPDATE OF payment_status, transaction_date, currency
  ON public.payment_history
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_payment_history_status();

-- Never delete rows (blocks service_role and authenticated)
CREATE OR REPLACE FUNCTION public.prevent_payment_history_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payment_history is append-only: deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payment_history_delete ON public.payment_history;
CREATE TRIGGER trg_prevent_payment_history_delete
  BEFORE DELETE ON public.payment_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payment_history_delete();

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;
-- Policies replaced in §12 (company_id = current_company; service_role write only)

GRANT SELECT ON public.payment_history TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.payment_history TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.payment_history FROM PUBLIC, anon, authenticated;
REVOKE DELETE ON public.payment_history FROM service_role;

-- ── 5. subscription_events — every action (Phase 1.4) ─────────────────────────
-- Allowed event_type (snake_case; never invent):
--   subscription_created | payment_pending | payment_verified | payment_failed
--   | cancelled | renewed | webhook_received | webhook_verified | webhook_failed

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type text
    CHECK (
      event_type IS NULL
      OR event_type IN (
        'subscription_created',
        'payment_pending',
        'payment_verified',
        'payment_failed',
        'cancelled',
        'renewed',
        'webhook_received',
        'webhook_verified',
        'webhook_failed'
      )
    ),
  source text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.subscription_events IS
  'Append-only log of every subscription action. Never invent event_type values.';

COMMENT ON COLUMN public.subscription_events.event_type IS
  'Allowed: subscription_created, payment_pending, payment_verified, payment_failed, cancelled, renewed, webhook_received, webhook_verified, webhook_failed.';
COMMENT ON COLUMN public.subscription_events.source IS
  'Origin e.g. api | payfast_itn | cron | admin | system.';

CREATE INDEX IF NOT EXISTS subscription_events_sub_created_idx
  ON public.subscription_events (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_events_company_created_idx
  ON public.subscription_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_events_type_created_idx
  ON public.subscription_events (event_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalize_subscription_event_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  t text;
BEGIN
  IF NEW.event_type IS NULL OR btrim(NEW.event_type) = '' THEN
    RAISE EXCEPTION 'subscription_events.event_type is required';
  END IF;

  t := lower(trim(NEW.event_type));
  t := replace(t, ' ', '_');

  -- Human labels → allow-list
  IF t IN ('subscription_created', 'subscriptioncreated') THEN
    t := 'subscription_created';
  ELSIF t IN ('payment_pending', 'paymentpending') THEN
    t := 'payment_pending';
  ELSIF t IN ('payment_verified', 'paymentverified') THEN
    t := 'payment_verified';
  ELSIF t IN ('payment_failed', 'paymentfailed') THEN
    t := 'payment_failed';
  ELSIF t IN ('cancelled', 'canceled', 'cancel') THEN
    t := 'cancelled';
  ELSIF t IN ('renewed', 'renew') THEN
    t := 'renewed';
  ELSIF t IN ('webhook_received', 'webhookreceived', 'itn_received') THEN
    t := 'webhook_received';
  ELSIF t IN ('webhook_verified', 'webhookverified', 'itn_verified') THEN
    t := 'webhook_verified';
  ELSIF t IN ('webhook_failed', 'webhookfailed', 'itn_failed') THEN
    t := 'webhook_failed';
  END IF;

  IF t NOT IN (
    'subscription_created',
    'payment_pending',
    'payment_verified',
    'payment_failed',
    'cancelled',
    'renewed',
    'webhook_received',
    'webhook_verified',
    'webhook_failed'
  ) THEN
    RAISE EXCEPTION
      'invalid subscription_events.event_type "%" — allowed: subscription_created, payment_pending, payment_verified, payment_failed, cancelled, renewed, webhook_received, webhook_verified, webhook_failed',
      NEW.event_type;
  END IF;

  NEW.event_type := t;
  IF NEW.details IS NULL THEN
    NEW.details := '{}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_event_type ON public.subscription_events;
CREATE TRIGGER trg_normalize_subscription_event_type
  BEFORE INSERT OR UPDATE OF event_type ON public.subscription_events
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_subscription_event_type();

CREATE OR REPLACE FUNCTION public.prevent_subscription_events_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'subscription_events is append-only: deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_subscription_events_delete ON public.subscription_events;
CREATE TRIGGER trg_prevent_subscription_events_delete
  BEFORE DELETE ON public.subscription_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_subscription_events_delete();

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
-- Policies replaced in §12 (company_id = current_company; service_role write only)

GRANT SELECT ON public.subscription_events TO authenticated;
GRANT INSERT, SELECT ON public.subscription_events TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_events FROM PUBLIC, anon, authenticated;
REVOKE DELETE, UPDATE ON public.subscription_events FROM service_role;

-- ── 6. Harden dunning events RLS (was open/default-deny) ─────────────────────

ALTER TABLE public.subscription_dunning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_dunning_events_admin_select" ON public.subscription_dunning_events;
CREATE POLICY "subscription_dunning_events_admin_select"
  ON public.subscription_dunning_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

GRANT SELECT ON public.subscription_dunning_events TO authenticated;
GRANT ALL ON public.subscription_dunning_events TO service_role;

-- ── 7. Helper: log subscription event (service_role) ──────────────────────────

CREATE OR REPLACE FUNCTION public.log_subscription_event(
  p_subscription_id uuid,
  p_event_type text,
  p_source text DEFAULT 'api',
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  v_company_id uuid;
BEGIN
  SELECT s.company_id INTO v_company_id
  FROM public.subscriptions s
  WHERE s.id = p_subscription_id;

  INSERT INTO public.subscription_events (
    subscription_id, company_id, event_type, source, details
  )
  VALUES (
    p_subscription_id,
    v_company_id,
    p_event_type,
    COALESCE(NULLIF(btrim(p_source), ''), 'api'),
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_subscription_event(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_subscription_event(uuid, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.log_subscription_event IS
  'Append a subscription_events row. Service role only. event_type must be in the allow-list.';

-- ── 8. payfast_itn_logs — never trust incoming ITN; save everything (Phase 1.5)

CREATE TABLE IF NOT EXISTS public.payfast_itn_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_data jsonb,
  verification_response text,
  signature_valid boolean,
  amount_valid boolean,
  merchant_valid boolean,
  verified boolean,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.payfast_itn_logs IS
  'Raw PayFast ITN audit trail. Persist every notify before mutating subscriptions. Never trust until signature + PayFast verify + amount + merchant all pass (verified=true).';

COMMENT ON COLUMN public.payfast_itn_logs.received_data IS
  'Full inbound ITN body (form fields as JSON). Saved even when invalid.';
COMMENT ON COLUMN public.payfast_itn_logs.verification_response IS
  'Raw response from PayFast server-to-server validate (e.g. VALID / INVALID).';
COMMENT ON COLUMN public.payfast_itn_logs.signature_valid IS
  'Local MD5/signature check against passphrase.';
COMMENT ON COLUMN public.payfast_itn_logs.amount_valid IS
  'amount_gross matches expected plans.amount / pending subscription amount.';
COMMENT ON COLUMN public.payfast_itn_logs.merchant_valid IS
  'merchant_id matches configured merchant.';
COMMENT ON COLUMN public.payfast_itn_logs.verified IS
  'True only when all checks pass. Subscription activation requires verified=true.';

CREATE INDEX IF NOT EXISTS payfast_itn_logs_created_idx
  ON public.payfast_itn_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS payfast_itn_logs_verified_created_idx
  ON public.payfast_itn_logs (verified, created_at DESC);

CREATE INDEX IF NOT EXISTS payfast_itn_logs_received_pf_payment_id_idx
  ON public.payfast_itn_logs ((received_data->>'pf_payment_id'))
  WHERE received_data ? 'pf_payment_id';

CREATE OR REPLACE FUNCTION public.prevent_payfast_itn_logs_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payfast_itn_logs is append-only: deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_payfast_itn_logs_delete ON public.payfast_itn_logs;
CREATE TRIGGER trg_prevent_payfast_itn_logs_delete
  BEFORE DELETE ON public.payfast_itn_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payfast_itn_logs_delete();

ALTER TABLE public.payfast_itn_logs ENABLE ROW LEVEL SECURITY;
-- Never expose ITN tables to JWT clients (no policies for authenticated). §12 hardens grants.

REVOKE ALL ON public.payfast_itn_logs FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.payfast_itn_logs TO service_role;
REVOKE DELETE ON public.payfast_itn_logs FROM service_role;

-- Insert ITN log as soon as notify arrives (service_role). Returns id for later UPDATE of flags.
CREATE OR REPLACE FUNCTION public.log_payfast_itn(
  p_received_data jsonb,
  p_verification_response text DEFAULT NULL,
  p_signature_valid boolean DEFAULT NULL,
  p_amount_valid boolean DEFAULT NULL,
  p_merchant_valid boolean DEFAULT NULL,
  p_verified boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.payfast_itn_logs (
    received_data,
    verification_response,
    signature_valid,
    amount_valid,
    merchant_valid,
    verified
  )
  VALUES (
    COALESCE(p_received_data, '{}'::jsonb),
    p_verification_response,
    p_signature_valid,
    p_amount_valid,
    p_merchant_valid,
    COALESCE(p_verified, false)
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_payfast_itn(jsonb, text, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_payfast_itn(jsonb, text, boolean, boolean, boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.log_payfast_itn IS
  'Persist raw PayFast ITN + verification flags. Service role only. Call before activating any subscription.';

-- ── 9. subscription_invoices — SaaS invoice after successful payment (Phase 1.6)
-- NOT public.invoices (Document Engine client invoices). Generated after verified ITN
-- + payment_history.completed. Status allow-list only: draft | paid | void | cancelled.

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  payment_history_id uuid REFERENCES public.payment_history(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  invoice_number text UNIQUE,
  status text
    CHECK (
      status IS NULL
      OR status IN ('draft', 'paid', 'void', 'cancelled')
    ),
  amount numeric(10, 2),
  currency text DEFAULT 'ZAR',
  description text,
  issued_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.subscription_invoices IS
  'SaaS billing invoices for Paidly subscription charges. Generated after successful verified payment. Distinct from Document Engine public.invoices.';

COMMENT ON COLUMN public.subscription_invoices.status IS
  'Allowed only: draft | paid | void | cancelled. Never invent statuses.';

CREATE INDEX IF NOT EXISTS subscription_invoices_subscription_created_idx
  ON public.subscription_invoices (subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_invoices_company_created_idx
  ON public.subscription_invoices (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscription_invoices_status_created_idx
  ON public.subscription_invoices (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_payment_history_uidx
  ON public.subscription_invoices (payment_history_id)
  WHERE payment_history_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_subscription_invoice_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS NULL OR btrim(NEW.status) = '' THEN
    NEW.status := 'draft';
  ELSE
    NEW.status := lower(trim(NEW.status));
    IF NEW.status IN ('canceled', 'cancel') THEN
      NEW.status := 'cancelled';
    END IF;
  END IF;

  IF NEW.status NOT IN ('draft', 'paid', 'void', 'cancelled') THEN
    RAISE EXCEPTION
      'invalid subscription_invoices.status "%" — allowed: draft, paid, void, cancelled',
      NEW.status;
  END IF;

  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;
  IF NEW.status = 'void' AND NEW.voided_at IS NULL THEN
    NEW.voided_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  IF NEW.status IN ('draft', 'paid') AND NEW.issued_at IS NULL THEN
    NEW.issued_at := now();
  END IF;

  IF NEW.currency IS NULL OR btrim(NEW.currency) = '' THEN
    NEW.currency := 'ZAR';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_invoice_status ON public.subscription_invoices;
CREATE TRIGGER trg_normalize_subscription_invoice_status
  BEFORE INSERT OR UPDATE ON public.subscription_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_subscription_invoice_status();

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
-- Policies replaced in §12

GRANT SELECT ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.subscription_invoices FROM PUBLIC, anon, authenticated;

-- ── 10. webhook_logs — debugging inbound/outbound webhooks (Phase 1.7) ────────

CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  direction text NOT NULL DEFAULT 'inbound'
    CHECK (direction IN ('inbound', 'outbound')),
  headers jsonb,
  body jsonb,
  response jsonb,
  status_code integer,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  path text,
  error text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.webhook_logs IS
  'Debug log for provider webhooks (PayFast ITN, POS, etc.). Provider, headers, body, response, status_code, duration.';

COMMENT ON COLUMN public.webhook_logs.provider IS
  'Provider slug e.g. payfast | yoco | square | other.';
COMMENT ON COLUMN public.webhook_logs.headers IS
  'Request/response headers (sanitize secrets before insert).';
COMMENT ON COLUMN public.webhook_logs.body IS
  'Parsed request body as JSON when possible.';
COMMENT ON COLUMN public.webhook_logs.response IS
  'Handler response payload returned to the provider.';
COMMENT ON COLUMN public.webhook_logs.status_code IS
  'HTTP status code returned (or received for outbound).';
COMMENT ON COLUMN public.webhook_logs.duration_ms IS
  'Handler duration in milliseconds.';

CREATE INDEX IF NOT EXISTS webhook_logs_provider_created_idx
  ON public.webhook_logs (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_logs_status_created_idx
  ON public.webhook_logs (status_code, created_at DESC);

CREATE INDEX IF NOT EXISTS webhook_logs_created_idx
  ON public.webhook_logs (created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_webhook_logs_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'webhook_logs is append-only: deletes are forbidden';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_webhook_logs_delete ON public.webhook_logs;
CREATE TRIGGER trg_prevent_webhook_logs_delete
  BEFORE DELETE ON public.webhook_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_webhook_logs_delete();

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
-- Members never see webhook logs; admins SELECT in §12. Writes: service_role only.

REVOKE ALL ON public.webhook_logs FROM PUBLIC, anon;
GRANT SELECT ON public.webhook_logs TO authenticated;
GRANT INSERT, SELECT ON public.webhook_logs TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.webhook_logs FROM authenticated;
REVOKE DELETE, UPDATE ON public.webhook_logs FROM service_role;

CREATE OR REPLACE FUNCTION public.log_webhook(
  p_provider text,
  p_headers jsonb DEFAULT NULL,
  p_body jsonb DEFAULT NULL,
  p_response jsonb DEFAULT NULL,
  p_status_code integer DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_direction text DEFAULT 'inbound',
  p_path text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  dir text;
BEGIN
  dir := lower(trim(COALESCE(p_direction, 'inbound')));
  IF dir NOT IN ('inbound', 'outbound') THEN
    dir := 'inbound';
  END IF;

  INSERT INTO public.webhook_logs (
    provider, direction, headers, body, response, status_code, duration_ms, path, error
  )
  VALUES (
    NULLIF(btrim(COALESCE(p_provider, '')), ''),
    dir,
    p_headers,
    p_body,
    p_response,
    p_status_code,
    p_duration_ms,
    p_path,
    p_error
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_webhook(text, jsonb, jsonb, jsonb, integer, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_webhook(text, jsonb, jsonb, jsonb, integer, integer, text, text, text) TO service_role;

COMMENT ON FUNCTION public.log_webhook IS
  'Append webhook_logs row for debugging. Service role only. Sanitize Authorization headers before calling.';

-- ── 11. Profile mirror: handle pending / inactive explicitly ──────────────────

CREATE OR REPLACE FUNCTION public.sync_profile_from_subscription_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_plan text;
  pl text;
  st text;
  prof_status text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  raw_plan := trim(coalesce(NEW.plan_slug, NEW.plan, NEW.current_plan, ''));

  -- Prefer plan_slug; empty plan_slug+plan → do not wipe profile from pending checkout rows
  -- that may only set m_payment_id (app still sends plan on create).
  IF raw_plan = '' THEN
    RETURN NEW;
  END IF;

  pl := lower(raw_plan);
  IF pl IN ('starter', 'free', 'basic', 'trial', 'none') OR pl = '' THEN
    pl := 'individual';
  ELSIF pl IN ('professional', 'business') THEN
    pl := 'sme';
  ELSIF pl IN ('enterprise', 'pro') THEN
    pl := 'corporate';
  ELSIF pl NOT IN ('individual', 'sme', 'corporate') THEN
    pl := 'individual';
  END IF;

  st := lower(trim(coalesce(NEW.status, '')));
  IF st IN ('canceled', 'cancel', 'inactive') THEN
    st := 'cancelled';
  ELSIF st = 'paused' THEN
    st := 'suspended';
  ELSIF st = 'trial' THEN
    st := 'trialing';
  END IF;

  -- profiles.subscription_status is a cache; SaaS SoR is subscriptions.status.
  -- Only active (and trialing) unlock is_pro — never pending/processing.
  prof_status := CASE
    WHEN st = 'pending' THEN 'pending'
    WHEN st = 'processing' THEN 'pending'
    WHEN st = 'active' THEN 'active'
    WHEN st = 'trialing' THEN 'trial'
    WHEN st = 'past_due' THEN 'past_due'
    WHEN st = 'failed' THEN 'failed'
    WHEN st = 'cancelled' THEN 'cancelled'
    WHEN st = 'expired' THEN 'expired'
    WHEN st = 'suspended' THEN 'suspended'
    ELSE 'cancelled'
  END;

  UPDATE public.profiles
  SET
    plan = pl,
    subscription_plan = pl,
    subscription_status = prof_status,
    trial_ends_at = CASE
      WHEN prof_status IN ('active') THEN NULL
      ELSE profiles.trial_ends_at
    END,
    is_pro = (st IN ('active', 'trialing')),
    updated_at = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_profile_from_subscription_row() IS
  'After subscriptions insert/update: mirror plan/status into profiles. Only active|trialing set is_pro.';

-- ── 12. RLS — current_company scope; admins all; ITN never exposed ────────────
-- Users: company_id = current_company_id() (organizations.id / product company_id).
-- Admins: is_admin() OR is_platform_admin() see all tenant rows.
-- Never expose: payfast_itn_logs (no authenticated policies / grants).
-- Service-role writes only: payment_history, subscription_events, payfast_itn_logs, webhook_logs.

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(COALESCE((SELECT auth.jwt()) ->> 'company_id', '')), '')::uuid,
    NULLIF(btrim(COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'company_id', '')), '')::uuid,
    (public.get_my_tenant_context() ->> 'company_id')::uuid
  );
$$;

COMMENT ON FUNCTION public.current_company_id() IS
  'Active tenant org id for RLS (product company_id). Prefer JWT company_id, else get_my_tenant_context().';

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_billing_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(), false)
      OR COALESCE(public.is_platform_admin(), false);
$$;

GRANT EXECUTE ON FUNCTION public.is_billing_admin() TO authenticated;

-- Ensure company_id → organizations (tenant), not multi-brand companies
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_company_id_fkey;
ALTER TABLE public.payment_history
  DROP CONSTRAINT IF EXISTS payment_history_company_id_fkey;
ALTER TABLE public.subscription_events
  DROP CONSTRAINT IF EXISTS subscription_events_company_id_fkey;
ALTER TABLE public.subscription_invoices
  DROP CONSTRAINT IF EXISTS subscription_invoices_company_id_fkey;

ALTER TABLE public.subscription_events
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
BEGIN
  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.payment_history
    ADD CONSTRAINT payment_history_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.subscription_events
    ADD CONSTRAINT subscription_events_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.organizations(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Shared predicate: tenant row visible to member or billing admin
-- (inlined in policies for clarity / InitPlan)

-- plans (catalog — no company_id; RLS already enabled)
DROP POLICY IF EXISTS "plans_public_select_active" ON public.plans;
DROP POLICY IF EXISTS "plans_admin_select_all" ON public.plans;
DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;

CREATE POLICY "plans_select_active_or_admin"
  ON public.plans FOR SELECT TO anon, authenticated
  USING (active IS TRUE OR public.is_billing_admin());

CREATE POLICY "plans_admin_write"
  ON public.plans FOR ALL TO authenticated
  USING (public.is_billing_admin())
  WITH CHECK (public.is_billing_admin());

-- subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_user_select_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_insert" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_update" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_delete" ON public.subscriptions;
DROP POLICY IF EXISTS "admin full access subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_company" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_admin_all" ON public.subscriptions;

CREATE POLICY "subscriptions_select_company"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
    )
  );

CREATE POLICY "subscriptions_admin_all"
  ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_billing_admin())
  WITH CHECK (public.is_billing_admin());

-- Members must not write subscription rows (checkout/ITN via service_role)
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

-- payment_history — SELECT by company; WRITE service_role only
DROP POLICY IF EXISTS "payment_history_select_own" ON public.payment_history;
DROP POLICY IF EXISTS "payment_history_admin_select" ON public.payment_history;
DROP POLICY IF EXISTS "payment_history_select_company" ON public.payment_history;

CREATE POLICY "payment_history_select_company"
  ON public.payment_history FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.payment_history FROM PUBLIC, anon, authenticated;

-- subscription_events — SELECT by company; WRITE service_role only
DROP POLICY IF EXISTS "subscription_events_select_own" ON public.subscription_events;
DROP POLICY IF EXISTS "subscription_events_select_company" ON public.subscription_events;

CREATE POLICY "subscription_events_select_company"
  ON public.subscription_events FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.subscription_events FROM PUBLIC, anon, authenticated;

-- subscription_invoices — SELECT by company; WRITE service_role only
DROP POLICY IF EXISTS "subscription_invoices_select_own" ON public.subscription_invoices;
DROP POLICY IF EXISTS "subscription_invoices_admin_write" ON public.subscription_invoices;
DROP POLICY IF EXISTS "subscription_invoices_select_company" ON public.subscription_invoices;
DROP POLICY IF EXISTS "subscription_invoices_admin_all" ON public.subscription_invoices;

CREATE POLICY "subscription_invoices_select_company"
  ON public.subscription_invoices FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR (
      company_id IS NOT NULL
      AND company_id = (SELECT public.current_company_id())
    )
  );

CREATE POLICY "subscription_invoices_admin_all"
  ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.is_billing_admin())
  WITH CHECK (public.is_billing_admin());

REVOKE INSERT, UPDATE, DELETE ON public.subscription_invoices FROM PUBLIC, anon, authenticated;

-- payfast_itn_logs — NEVER expose to authenticated (RLS on, zero client policies)
DROP POLICY IF EXISTS "payfast_itn_logs_admin_select" ON public.payfast_itn_logs;
DROP POLICY IF EXISTS "payfast_itn_logs_select" ON public.payfast_itn_logs;

REVOKE ALL ON public.payfast_itn_logs FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT, UPDATE ON public.payfast_itn_logs TO service_role;
REVOKE DELETE ON public.payfast_itn_logs FROM service_role;

-- webhook_logs — WRITE service_role only; admins may SELECT for debugging; members never
DROP POLICY IF EXISTS "webhook_logs_admin_select" ON public.webhook_logs;
DROP POLICY IF EXISTS "webhook_logs_select_admin" ON public.webhook_logs;

CREATE POLICY "webhook_logs_select_admin"
  ON public.webhook_logs FOR SELECT TO authenticated
  USING (public.is_billing_admin());

REVOKE INSERT, UPDATE, DELETE ON public.webhook_logs FROM PUBLIC, anon, authenticated;
GRANT INSERT, SELECT ON public.webhook_logs TO service_role;

-- dunning: company via subscription join + admin
DROP POLICY IF EXISTS "subscription_dunning_events_admin_select" ON public.subscription_dunning_events;
DROP POLICY IF EXISTS "subscription_dunning_events_select_company" ON public.subscription_dunning_events;

CREATE POLICY "subscription_dunning_events_select_company"
  ON public.subscription_dunning_events FOR SELECT TO authenticated
  USING (
    public.is_billing_admin()
    OR EXISTS (
      SELECT 1
      FROM public.subscriptions s
      WHERE s.id = subscription_dunning_events.subscription_id
        AND s.company_id IS NOT NULL
        AND s.company_id = (SELECT public.current_company_id())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.subscription_dunning_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscription_dunning_events TO authenticated;
GRANT ALL ON public.subscription_dunning_events TO service_role;
