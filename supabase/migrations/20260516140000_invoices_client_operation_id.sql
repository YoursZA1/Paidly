-- Wave 3: idempotent invoice creates from sync queue (client_operation_id per org).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS client_operation_id text;

COMMENT ON COLUMN public.invoices.client_operation_id IS
  'Client-generated idempotency key (sync queue operationId). Unique per org when set.';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_client_operation_id_unique
  ON public.invoices (org_id, client_operation_id)
  WHERE client_operation_id IS NOT NULL;
