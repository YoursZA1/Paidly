-- Dashboard list performance: composite indexes for org-scoped lists ordered by created_at.
-- Run in Supabase SQL Editor. RLS filters by org_id via memberships; these indexes speed up
-- .order('created_at', { ascending: false }) style queries.

-- Invoices: dashboard "Recent Invoices" and list views
create index if not exists idx_invoices_org_id_created_at
  on public.invoices (org_id, created_at desc);

-- Payments: dashboard and payment history
create index if not exists idx_payments_org_id_created_at
  on public.payments (org_id, created_at desc);

-- Optional: if your schema has user_id on invoices (e.g. created_by or owner), uncomment:
-- create index if not exists idx_invoices_user_id on public.invoices (user_id);
-- create index if not exists idx_invoices_user_id_created_at on public.invoices (user_id, created_at desc);
