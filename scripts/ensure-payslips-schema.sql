-- Ensure payslips table exists (match Payslip_export.csv and user activity). Payroll entity uses this table.
-- Run in Supabase SQL Editor. Requires public.organizations. Run supabase/schema.postgres.sql first if needed.

create table if not exists public.payslips (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payslip_number text,
  employee_name text,
  employee_id text,
  employee_email text,
  employee_phone text,
  position text,
  department text,
  pay_period_start date,
  pay_period_end date,
  pay_date date,
  basic_salary numeric(12,2) default 0,
  overtime_hours numeric(12,2) default 0,
  overtime_rate numeric(12,2) default 0,
  allowances jsonb default '[]',
  gross_pay numeric(12,2) default 0,
  tax_deduction numeric(12,2) default 0,
  uif_deduction numeric(12,2) default 0,
  pension_deduction numeric(12,2) default 0,
  medical_aid_deduction numeric(12,2) default 0,
  other_deductions jsonb default '[]',
  total_deductions numeric(12,2) default 0,
  net_pay numeric(12,2) default 0,
  status text default 'draft',
  public_share_token text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

alter table public.payslips enable row level security;

drop policy if exists "admin full access payslips" on public.payslips;
create policy "admin full access payslips" on public.payslips
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org members select payslips" on public.payslips;
create policy "org members select payslips" on public.payslips
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  ));

drop policy if exists "org members write payslips" on public.payslips;
create policy "org members write payslips" on public.payslips
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  ));

create index if not exists idx_payslips_org_id on public.payslips(org_id);
create index if not exists idx_payslips_pay_date on public.payslips(pay_date desc);
create index if not exists idx_payslips_created_at on public.payslips(created_at desc);

drop trigger if exists update_payslips_updated_at on public.payslips;
create trigger update_payslips_updated_at
  before update on public.payslips
  for each row
  execute function public.update_updated_at_column();
