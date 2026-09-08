-- Idempotent invoice settlement from payment_intents (Ozow).
-- One payments row per intent reference; failed/cancelled intents never write revenue.

CREATE UNIQUE INDEX IF NOT EXISTS payments_ozow_intent_reference_uniq
  ON public.payments (org_id, reference)
  WHERE method = 'ozow'
    AND reference IS NOT NULL
    AND btrim(reference) <> '';

COMMENT ON INDEX public.payments_ozow_intent_reference_uniq IS
  'Ozow document settlement is idempotent: payment_intents.id is stored on payments.reference.';
