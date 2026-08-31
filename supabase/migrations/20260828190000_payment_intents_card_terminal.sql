-- Card is a physical-terminal rail, not Ozow and not click-to-paid.
-- Native till has no card-present SDK; intents may be created but must not settle as paid
-- until a real terminal/provider confirmation exists.

DO $$
BEGIN
  IF to_regclass('public.payment_intents') IS NULL THEN
    RAISE EXCEPTION 'payment_intents missing. Apply 20260828180000_payment_intents.sql first.';
  END IF;
END $$;

ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_pos_provider_check;

ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_pos_provider_check CHECK (
    (source_kind = 'pos' AND provider IN ('cash', 'ozow', 'card_terminal'))
    OR (source_kind = 'document' AND provider IN ('ozow'))
  );

COMMENT ON COLUMN public.payment_intents.provider IS
  'Customer rail: cash (till-verified), ozow (digital/EFT), card_terminal (hardware — not faked). Never payfast.';
