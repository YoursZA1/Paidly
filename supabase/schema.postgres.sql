create extension if not exists "uuid-ossp";

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  logo_url text,
  company_name text,
  company_address text,
  currency text default 'USD',
  timezone text default 'UTC',
  invoice_template text default 'classic',
  invoice_header text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Trigger: requires profiles.company_address to exist (run scripts/fix-signup-trigger.sql if signup fails with "Database error saving new user").
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url, logo_url, company_name, company_address, currency, timezone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.raw_user_meta_data->>'logo_url',
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'company_address',
    coalesce(new.raw_user_meta_data->>'currency', 'USD'),
    coalesce(new.raw_user_meta_data->>'timezone', 'UTC')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url,
    logo_url = coalesce(excluded.logo_url, profiles.logo_url),
    company_name = coalesce(excluded.company_name, profiles.company_name),
    company_address = coalesce(excluded.company_address, profiles.company_address),
    currency = coalesce(excluded.currency, profiles.currency),
    timezone = coalesce(excluded.timezone, profiles.timezone),
    updated_at = now();

  insert into public.organizations (name, owner_id)
  values (coalesce(new.raw_user_meta_data->>'org_name', 'My Organization'), new.id)
  returning id into new_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table if not exists public.clients (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  contact_person text,
  website text,
  tax_id text,
  fax text,
  alternate_email text,
  notes text,
  internal_notes text,
  industry text,
  payment_terms text default 'net_30',
  payment_terms_days integer default 30,
  follow_up_enabled boolean default true,
  segment text,
  total_spent numeric(12,2) default 0,
  last_invoice_date timestamptz,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  
  -- Base Fields (Mandatory for all item types)
  item_type text not null default 'service' check (item_type in ('service', 'product', 'labor', 'material', 'expense')),
  default_unit text not null,
  default_rate numeric(12,2) not null default 0,
  tax_category text default 'standard' check (tax_category in ('standard', 'reduced', 'zero', 'exempt')),
  is_active boolean default true,
  
  -- Legacy/Backward Compatibility Fields
  rate numeric(12,2) default 0,
  unit text,
  unit_price numeric(12,2),
  unit_of_measure text,
  service_type text,
  
  -- Type-Specific Fields (Products)
  sku text,
  price numeric(12,2),
  
  -- Type-Specific Fields (Services)
  billing_unit text,
  
  -- Type-Specific Fields (Labor)
  role text,
  hourly_rate numeric(12,2),
  
  -- Type-Specific Fields (Materials)
  unit_type text,
  cost_rate numeric(12,2),
  
  -- Type-Specific Fields (Expenses)
  cost_type text check (cost_type in ('fixed', 'variable')),
  default_cost numeric(12,2),
  
  -- Optional Fields
  category text,
  pricing_type text check (pricing_type in ('hourly', 'fixed', 'per_item', 'daily', 'weekly', 'monthly')),
  min_quantity integer default 1,
  tags text[],
  estimated_duration text,
  requirements text,
  
  -- Pricing Controls
  price_locked boolean default false,
  price_locked_at timestamptz,
  price_locked_reason text,
  
  -- Usage Tracking
  usage_count integer default 0,
  last_used_date timestamptz,
  
  -- Type-Specific Data (JSONB for flexibility)
  type_specific_data jsonb,
  
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  quote_number text,
  status text not null default 'draft',
  project_title text,
  project_description text,
  valid_until date,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text default 'USD',
  notes text,
  terms_conditions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default uuid_generate_v4(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_name text,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0
);

create table if not exists public.invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text,
  status text not null default 'draft',
  project_title text,
  project_description text,
  invoice_date date,
  delivery_date date,
  delivery_address text,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text default 'USD',
  notes text,
  terms_conditions text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  banking_detail_id uuid,
  upfront_payment numeric(12,2),
  milestone_payment numeric(12,2),
  final_payment numeric(12,2),
  milestone_date date,
  final_date date,
  pdf_url text,
  recurring_invoice_id uuid,
  public_share_token text,
  sent_to_email text,
  owner_company_name text,
  owner_company_address text,
  owner_logo_url text,
  owner_email text,
  owner_currency text
);

create table if not exists public.invoice_items (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_name text,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total_price numeric(12,2) not null default 0
);

create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  paid_at timestamptz,
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banking_details (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  bank_name text not null,
  account_name text,
  account_number text,
  routing_number text,
  swift_code text,
  payment_method text default 'bank_transfer',
  additional_info text,
  payment_gateway_url text,
  is_default boolean default false,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_invoices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_name text,
  client_id uuid references public.clients(id) on delete set null,
  invoice_template jsonb,
  frequency text not null default 'monthly',
  start_date date,
  end_date date,
  next_generation_date date,
  status text not null default 'active',
  last_generated_invoice_id uuid references public.invoices(id) on delete set null,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Subscription packages (Package_export.csv): platform or org-scoped; user activity via created_by_id
create table if not exists public.packages (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  currency text default 'ZAR',
  frequency text default '/month',
  features jsonb default '[]',
  is_recommended boolean default false,
  website_link text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

-- Invoice view tracking (InvoiceView_export.csv): who viewed which invoice; user activity via created_by_id
create table if not exists public.invoice_views (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  viewed_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  is_read boolean default false,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

-- Payslips (Payslip_export.csv): payroll records; user activity via created_by_id. Payroll entity maps to this table.
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

-- Expenses (Expense_export.csv): expense records; user activity via created_by_id. Expense entity uses this table.
create table if not exists public.expenses (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_number text,
  category text,
  description text,
  amount numeric(12,2) not null default 0,
  date date not null default (current_date),
  payment_method text,
  vendor text,
  receipt_url text,
  is_claimable boolean default false,
  claimed boolean default false,
  notes text,
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

-- Tasks (Task_export.csv): task records; user activity via created_by_id. Task entity uses this table.
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  description text,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to text,
  due_date date,
  priority text default 'medium',
  status text default 'pending',
  category text default 'other',
  parent_task_id uuid references public.tasks(id) on delete set null,
  depends_on jsonb default '[]',
  estimated_hours numeric(12,2),
  tags text[] default '{}',
  created_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean default false
);

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.banking_details enable row level security;
alter table public.recurring_invoices enable row level security;
alter table public.packages enable row level security;
alter table public.invoice_views enable row level security;
alter table public.payslips enable row level security;
alter table public.expenses enable row level security;
alter table public.tasks enable row level security;
alter table public.notifications enable row level security;

-- Drop existing policies so this script is idempotent (safe to re-run)
drop policy if exists "admin full access organizations" on public.organizations;
drop policy if exists "admin full access profiles" on public.profiles;
drop policy if exists "admin full access memberships" on public.memberships;
drop policy if exists "admin full access clients" on public.clients;
drop policy if exists "org members select" on public.clients;
drop policy if exists "org members write" on public.clients;
drop policy if exists "admin full access services" on public.services;
drop policy if exists "org members select services" on public.services;
drop policy if exists "org members write services" on public.services;
drop policy if exists "admin full access quotes" on public.quotes;
drop policy if exists "org members select quotes" on public.quotes;
drop policy if exists "org members write quotes" on public.quotes;
drop policy if exists "admin full access quote items" on public.quote_items;
drop policy if exists "org members select quote items" on public.quote_items;
drop policy if exists "org members write quote items" on public.quote_items;
drop policy if exists "admin full access invoices" on public.invoices;
drop policy if exists "org members select invoices" on public.invoices;
drop policy if exists "org members write invoices" on public.invoices;
drop policy if exists "admin full access invoice items" on public.invoice_items;
drop policy if exists "org members select invoice items" on public.invoice_items;
drop policy if exists "org members write invoice items" on public.invoice_items;
drop policy if exists "admin full access payments" on public.payments;
drop policy if exists "org members select payments" on public.payments;
drop policy if exists "org members write payments" on public.payments;
drop policy if exists "admin full access banking_details" on public.banking_details;
drop policy if exists "org members select banking_details" on public.banking_details;
drop policy if exists "org members write banking_details" on public.banking_details;
drop policy if exists "org members update banking_details" on public.banking_details;
drop policy if exists "org members delete banking_details" on public.banking_details;
drop policy if exists "admin full access recurring_invoices" on public.recurring_invoices;
drop policy if exists "org members select recurring_invoices" on public.recurring_invoices;
drop policy if exists "org members write recurring_invoices" on public.recurring_invoices;
drop policy if exists "org members update recurring_invoices" on public.recurring_invoices;
drop policy if exists "org members delete recurring_invoices" on public.recurring_invoices;
drop policy if exists "admin full access packages" on public.packages;
drop policy if exists "packages select platform or own org" on public.packages;
drop policy if exists "packages insert admin or org" on public.packages;
drop policy if exists "packages update admin or org" on public.packages;
drop policy if exists "packages delete admin or org" on public.packages;
drop policy if exists "admin full access invoice_views" on public.invoice_views;
drop policy if exists "org members select invoice_views" on public.invoice_views;
drop policy if exists "org members write invoice_views" on public.invoice_views;
drop policy if exists "admin full access payslips" on public.payslips;
drop policy if exists "org members select payslips" on public.payslips;
drop policy if exists "org members write payslips" on public.payslips;
drop policy if exists "admin full access expenses" on public.expenses;
drop policy if exists "org members select expenses" on public.expenses;
drop policy if exists "org members write expenses" on public.expenses;
drop policy if exists "admin full access tasks" on public.tasks;
drop policy if exists "org members select tasks" on public.tasks;
drop policy if exists "org members write tasks" on public.tasks;
drop policy if exists "admin full access notifications" on public.notifications;
drop policy if exists "users own notifications" on public.notifications;
drop policy if exists "org owner manage org" on public.organizations;
drop policy if exists "profile self access" on public.profiles;
drop policy if exists "memberships org access" on public.memberships;
drop policy if exists "memberships owner manage" on public.memberships;

create policy "admin full access organizations" on public.organizations
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access profiles" on public.profiles
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access memberships" on public.memberships
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access clients" on public.clients
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access services" on public.services
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access quotes" on public.quotes
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access quote items" on public.quote_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access invoices" on public.invoices
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access invoice items" on public.invoice_items
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access payments" on public.payments
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "admin full access banking_details" on public.banking_details
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select banking_details" on public.banking_details
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members write banking_details" on public.banking_details
  for insert
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members update banking_details" on public.banking_details
  for update
  using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "org members delete banking_details" on public.banking_details
  for delete
  using (exists (
    select 1 from public.memberships m
    where m.org_id = banking_details.org_id and m.user_id = auth.uid()
  ));

create policy "admin full access recurring_invoices" on public.recurring_invoices
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select recurring_invoices" on public.recurring_invoices
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

create policy "org members write recurring_invoices" on public.recurring_invoices
  for insert
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

create policy "org members update recurring_invoices" on public.recurring_invoices
  for update
  using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

create policy "org members delete recurring_invoices" on public.recurring_invoices
  for delete
  using (exists (
    select 1 from public.memberships m
    where m.org_id = recurring_invoices.org_id and m.user_id = auth.uid()
  ));

-- Packages: platform (org_id null) visible to all; org-scoped visible to org members; admin full access
create policy "admin full access packages" on public.packages
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "packages select platform or own org" on public.packages
  for select
  to authenticated
  using (
    packages.org_id is null
    or exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    )
  );

create policy "packages insert admin or org" on public.packages
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

create policy "packages update admin or org" on public.packages
  for update
  to authenticated
  using (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  )
  with check (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

create policy "packages delete admin or org" on public.packages
  for delete
  to authenticated
  using (
    public.is_admin()
    or (packages.org_id is not null and exists (
      select 1 from public.memberships m
      where m.org_id = packages.org_id and m.user_id = auth.uid()
    ))
  );

-- Invoice views: org-scoped; user activity via created_by_id
create policy "admin full access invoice_views" on public.invoice_views
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select invoice_views" on public.invoice_views
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  ));

create policy "org members write invoice_views" on public.invoice_views
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = invoice_views.org_id and m.user_id = auth.uid()
  ));

-- Payslips: org-scoped; user activity via created_by_id
create policy "admin full access payslips" on public.payslips
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select payslips" on public.payslips
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  ));

create policy "org members write payslips" on public.payslips
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = payslips.org_id and m.user_id = auth.uid()
  ));

create policy "admin full access expenses" on public.expenses
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select expenses" on public.expenses
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  ));

create policy "org members write expenses" on public.expenses
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = expenses.org_id and m.user_id = auth.uid()
  ));

create policy "admin full access tasks" on public.tasks
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "org members select tasks" on public.tasks
  for select using (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  ));

create policy "org members write tasks" on public.tasks
  for all using (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  )) with check (exists (
    select 1 from public.memberships m
    where m.org_id = tasks.org_id and m.user_id = auth.uid()
  ));

create policy "admin full access notifications" on public.notifications
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "users own notifications" on public.notifications
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "org owner manage org" on public.organizations
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "profile self access" on public.profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- Non-recursive: do not query memberships inside this policy (avoids infinite recursion)
create policy "memberships org access" on public.memberships
  for select
  using (
    memberships.user_id = auth.uid()
    or exists (
      select 1 from public.organizations o
      where o.id = memberships.org_id and o.owner_id = auth.uid()
    )
  );

create policy "memberships owner manage" on public.memberships
  for all
  using (exists (
    select 1 from public.organizations o
    where o.id = memberships.org_id and o.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.organizations o
    where o.id = memberships.org_id and o.owner_id = auth.uid()
  ));

create policy "org members select" on public.clients
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = clients.org_id and m.user_id = auth.uid()
  ));

create policy "org members write" on public.clients
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = clients.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = clients.org_id and m.user_id = auth.uid()
  ));

create policy "org members select services" on public.services
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = services.org_id and m.user_id = auth.uid()
  ));

create policy "org members write services" on public.services
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = services.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = services.org_id and m.user_id = auth.uid()
  ));

create policy "org members select quotes" on public.quotes
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ));

create policy "org members write quotes" on public.quotes
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = quotes.org_id and m.user_id = auth.uid()
  ));

create policy "org members select quote items" on public.quote_items
  for select
  using (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ));

create policy "org members write quote items" on public.quote_items
  for all
  using (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.quotes q
    join public.memberships m on m.org_id = q.org_id
    where q.id = quote_items.quote_id and m.user_id = auth.uid()
  ));

create policy "org members select invoices" on public.invoices
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ));

create policy "org members write invoices" on public.invoices
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = invoices.org_id and m.user_id = auth.uid()
  ));

create policy "org members select invoice items" on public.invoice_items
  for select
  using (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ));

create policy "org members write invoice items" on public.invoice_items
  for all
  using (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.invoices i
    join public.memberships m on m.org_id = i.org_id
    where i.id = invoice_items.invoice_id and m.user_id = auth.uid()
  ));

create policy "org members select payments" on public.payments
  for select
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ));

create policy "org members write payments" on public.payments
  for all
  using (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.org_id = payments.org_id and m.user_id = auth.uid()
  ));

-- Create storage buckets if they don't exist
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('invoicebreek', 'invoicebreek', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Profile logos (private; use signed URLs)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('profile-logos', 'profile-logos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Activities (receipts, attachments, exports; private; org-scoped path: org_id/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('activities', 'activities', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/csv', 'application/csv'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bank details (statements, imports; private; org-scoped path: org_id/...)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('bank-details', 'bank-details', false, 52428800, ARRAY['application/pdf', 'text/csv', 'application/csv', 'application/vnd.ms-excel'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Policy: Users can upload/read their own objects (path first segment = auth.uid(), e.g. logos)
drop policy if exists "Users can upload own logos" on storage.objects;
create policy "Users can upload own logos" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id IN ('invoicebreek', 'profile-logos') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can read own logos" on storage.objects;
create policy "Users can read own logos" on storage.objects
  for select
  to authenticated
  using (
    bucket_id IN ('invoicebreek', 'profile-logos') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Users can update/delete their own objects (e.g. replace or remove logo)
drop policy if exists "Users can update delete own storage" on storage.objects;
create policy "Users can update delete own storage" on storage.objects
  for update
  to authenticated
  using (
    bucket_id IN ('invoicebreek', 'profile-logos') AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id IN ('invoicebreek', 'profile-logos') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own storage" on storage.objects;
create policy "Users can delete own storage" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id IN ('invoicebreek', 'profile-logos') AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Organization members can access org-scoped objects (path first segment = org_id)
drop policy if exists "org members access assets" on storage.objects;
create policy "org members access assets" on storage.objects
  for all
  using (
    bucket_id IN ('invoicebreek', 'profile-logos', 'activities', 'bank-details') AND exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and (storage.foldername(name))[1] = m.org_id::text
    )
  )
  with check (
    bucket_id IN ('invoicebreek', 'profile-logos', 'activities', 'bank-details') AND exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and (storage.foldername(name))[1] = m.org_id::text
    )
  );

-- Policy: Admin full access to all storage buckets
drop policy if exists "admin access storage buckets" on storage.objects;
create policy "admin access storage buckets" on storage.objects
  for all
  using (
    bucket_id IN ('invoicebreek', 'profile-logos', 'activities', 'bank-details') AND public.is_admin()
  )
  with check (
    bucket_id IN ('invoicebreek', 'profile-logos', 'activities', 'bank-details') AND public.is_admin()
  );

-- Indexes for better query performance
create index if not exists idx_clients_org_id on public.clients(org_id);
create index if not exists idx_clients_name on public.clients(name);
create index if not exists idx_clients_email on public.clients(email);
create index if not exists idx_clients_created_at on public.clients(created_at desc);

create index if not exists idx_services_org_id on public.services(org_id);
create index if not exists idx_services_item_type on public.services(item_type);
create index if not exists idx_services_name on public.services(name);
create index if not exists idx_services_is_active on public.services(is_active);
create index if not exists idx_services_category on public.services(category);
create index if not exists idx_services_created_at on public.services(created_at desc);
create index if not exists idx_services_usage_count on public.services(usage_count desc);
create index if not exists idx_services_last_used_date on public.services(last_used_date desc);

create index if not exists idx_invoices_org_id on public.invoices(org_id);
create index if not exists idx_invoices_client_id on public.invoices(client_id);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_invoice_number on public.invoices(invoice_number);
create index if not exists idx_invoices_created_at on public.invoices(created_at desc);

create index if not exists idx_quotes_org_id on public.quotes(org_id);
create index if not exists idx_quotes_client_id on public.quotes(client_id);
create index if not exists idx_quotes_quote_number on public.quotes(quote_number);
create index if not exists idx_quotes_status on public.quotes(status);
create index if not exists idx_quotes_created_at on public.quotes(created_at desc);

create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);
create index if not exists idx_quote_items_quote_id on public.quote_items(quote_id);

create index if not exists idx_banking_details_org_id on public.banking_details(org_id);
create index if not exists idx_banking_details_created_at on public.banking_details(created_at desc);

create index if not exists idx_recurring_invoices_org_id on public.recurring_invoices(org_id);
create index if not exists idx_recurring_invoices_created_at on public.recurring_invoices(created_at desc);

create index if not exists idx_packages_org_id on public.packages(org_id);
create index if not exists idx_packages_created_at on public.packages(created_at desc);

create index if not exists idx_invoice_views_org_id on public.invoice_views(org_id);
create index if not exists idx_invoice_views_invoice_id on public.invoice_views(invoice_id);
create index if not exists idx_invoice_views_viewed_at on public.invoice_views(viewed_at desc);

create index if not exists idx_payslips_org_id on public.payslips(org_id);
create index if not exists idx_payslips_pay_date on public.payslips(pay_date desc);
create index if not exists idx_payslips_created_at on public.payslips(created_at desc);

create index if not exists idx_expenses_org_id on public.expenses(org_id);
create index if not exists idx_expenses_date on public.expenses(date desc);
create index if not exists idx_expenses_created_at on public.expenses(created_at desc);

create index if not exists idx_tasks_org_id on public.tasks(org_id);
create index if not exists idx_tasks_due_date on public.tasks(due_date desc);
create index if not exists idx_tasks_created_at on public.tasks(created_at desc);
create index if not exists idx_tasks_status on public.tasks(status);

-- Function to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers to auto-update updated_at
drop trigger if exists update_clients_updated_at on public.clients;
create trigger update_clients_updated_at
  before update on public.clients
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_services_updated_at on public.services;
create trigger update_services_updated_at
  before update on public.services
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_invoices_updated_at on public.invoices;
create trigger update_invoices_updated_at
  before update on public.invoices
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_quotes_updated_at on public.quotes;
create trigger update_quotes_updated_at
  before update on public.quotes
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_payments_updated_at on public.payments;
create trigger update_payments_updated_at
  before update on public.payments
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_banking_details_updated_at on public.banking_details;
create trigger update_banking_details_updated_at
  before update on public.banking_details
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_recurring_invoices_updated_at on public.recurring_invoices;
create trigger update_recurring_invoices_updated_at
  before update on public.recurring_invoices
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_packages_updated_at on public.packages;
create trigger update_packages_updated_at
  before update on public.packages
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_invoice_views_updated_at on public.invoice_views;
create trigger update_invoice_views_updated_at
  before update on public.invoice_views
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_payslips_updated_at on public.payslips;
create trigger update_payslips_updated_at
  before update on public.payslips
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_expenses_updated_at on public.expenses;
create trigger update_expenses_updated_at
  before update on public.expenses
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists update_tasks_updated_at on public.tasks;
create trigger update_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.update_updated_at_column();

-- Ensure updated_at exists on invoices, quotes, payments (for existing DBs created before this column)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'invoices' and column_name = 'updated_at') then
    alter table public.invoices add column updated_at timestamptz not null default now();
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quotes' and column_name = 'updated_at') then
    alter table public.quotes add column updated_at timestamptz not null default now();
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name = 'updated_at') then
    alter table public.payments add column updated_at timestamptz not null default now();
  end if;
end $$;

-- Supabase Realtime: add tables to the realtime publication so postgres_changes events are broadcast (e.g. invoice status changes)
do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.quotes;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.payments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.clients;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;

-- Activity notifications: notify document owner when invoice/quote status changes (viewed, paid, accepted)
create or replace function public.notify_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  msg text;
  target_user_id uuid;
begin
  target_user_id := null;
  msg := null;

  if tg_table_name = 'invoices' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      if new.status = 'viewed' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' was viewed by the client.';
      elsif new.status = 'paid' then
        msg := 'Invoice #' || coalesce(new.invoice_number, '') || ' has been fully paid.';
      elsif new.status = 'partial_paid' then
        msg := 'A payment was received for Invoice #' || coalesce(new.invoice_number, '') || ' (partial).';
      end if;
    end if;
  elsif tg_table_name = 'quotes' then
    if old.status is distinct from new.status and new.created_by is not null then
      target_user_id := new.created_by;
      if new.status = 'viewed' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was viewed by the client.';
      elsif new.status = 'accepted' then
        msg := 'Quote #' || coalesce(new.quote_number, '') || ' was accepted.';
      end if;
    end if;
  end if;

  if target_user_id is not null and msg is not null then
    insert into public.notifications (user_id, message, read)
    values (target_user_id, msg, false);
  end if;

  return new;
end;
$$;

drop trigger if exists activity_notify_invoices on public.invoices;
create trigger activity_notify_invoices
  after update on public.invoices
  for each row
  execute function public.notify_activity();

drop trigger if exists activity_notify_quotes on public.quotes;
create trigger activity_notify_quotes
  after update on public.quotes
  for each row
  execute function public.notify_activity();
