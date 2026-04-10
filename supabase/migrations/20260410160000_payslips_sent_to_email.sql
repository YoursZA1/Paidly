-- Public payslip link verification (matches app usage: Payroll.update sent_to_email when marked sent).
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS sent_to_email text;

COMMENT ON COLUMN public.payslips.sent_to_email IS
  'Email the payslip was sent to; when set, public share view requires matching verification (viewer token).';
