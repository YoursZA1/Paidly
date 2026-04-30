-- Dashboard/list performance indexes for common org-scoped recency queries.
-- Safe and idempotent.

CREATE INDEX IF NOT EXISTS invoices_org_created_at_idx
  ON public.invoices (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payslips_org_created_at_idx
  ON public.payslips (org_id, created_at DESC);

