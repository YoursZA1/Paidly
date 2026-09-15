-- Additive indexes for Workforce directory, profile tabs, and pay-run validation.
-- Does not change identity, RLS, or existing columns.

CREATE INDEX IF NOT EXISTS idx_memberships_org_created
  ON public.memberships (org_id, created_at);

CREATE INDEX IF NOT EXISTS idx_memberships_org_department
  ON public.memberships (org_id, department)
  WHERE department IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_profiles_membership
  ON public.payroll_profiles (org_id, membership_id);

CREATE INDEX IF NOT EXISTS idx_payslips_org_membership_period
  ON public.payslips (org_id, membership_id, pay_period_start DESC);

CREATE INDEX IF NOT EXISTS idx_leave_requests_org_employee_start
  ON public.leave_requests (org_id, employee_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_leave_balances_org_employee_year
  ON public.leave_balances (org_id, employee_id, leave_year);

CREATE INDEX IF NOT EXISTS idx_workforce_events_employee
  ON public.workforce_events (org_id, employee_id, created_at DESC);
