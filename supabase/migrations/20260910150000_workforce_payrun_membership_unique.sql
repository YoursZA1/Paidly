-- One pay-run line per employee membership. Additive; skips if residual nulls collide.

CREATE UNIQUE INDEX IF NOT EXISTS pay_run_items_run_membership_uidx
  ON public.pay_run_items (pay_run_id, membership_id)
  WHERE membership_id IS NOT NULL;
