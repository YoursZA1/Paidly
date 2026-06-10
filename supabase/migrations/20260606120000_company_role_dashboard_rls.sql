-- Company (org) role-based dashboard: normalized membership roles + scoped RLS.
-- Tenancy key remains org_id; application layer aliases org_id as company_id.

-- ── Role normalization ────────────────────────────────────────────────────────
update public.memberships
set role = 'employee'
where lower(trim(role)) in ('member', '');

-- ── Helper functions ──────────────────────────────────────────────────────────

create or replace function public.normalize_company_role(raw text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(raw, '')))
    when 'owner' then 'admin'
    when 'admin' then 'admin'
    when 'manager' then 'manager'
    when 'employee' then 'employee'
    when 'member' then 'employee'
    else 'employee'
  end;
$$;

comment on function public.normalize_company_role(text) is
  'Maps memberships.role to employee | manager | admin (owner → admin).';

create or replace function public.user_primary_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;
$$;

create or replace function public.user_company_role_for_org(target_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.normalize_company_role(m.role)
  from public.memberships m
  where m.org_id = target_org_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_company_admin_for_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_company_role_for_org(target_org_id) = 'admin';
$$;

create or replace function public.is_company_manager_for_org(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_company_role_for_org(target_org_id) in ('admin', 'manager');
$$;

create or replace function public.can_read_document_row(d public.documents)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = d.org_id
      and m.user_id = auth.uid()
  )
  and (
    public.is_admin()
    or public.is_company_admin_for_org(d.org_id)
    or public.is_company_manager_for_org(d.org_id)
    or d.created_by = auth.uid()
    or d.user_id = auth.uid()
    or d.assigned_user_id = auth.uid()
  );
$$;

-- Payslip employee link (for employee self-service)
alter table public.payslips
  add column if not exists employee_user_id uuid references auth.users(id) on delete set null;

create index if not exists payslips_employee_user_id_idx
  on public.payslips (org_id, employee_user_id)
  where employee_user_id is not null;

create or replace function public.can_read_payslip_row(p public.payslips)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.org_id = p.org_id
      and m.user_id = auth.uid()
  )
  and (
    public.is_admin()
    or public.is_company_admin_for_org(p.org_id)
    or public.is_company_manager_for_org(p.org_id)
    or p.employee_user_id = auth.uid()
    or p.user_id = auth.uid()
    or p.created_by_id = auth.uid()
    or (
      p.employee_email is not null
      and lower(trim(p.employee_email)) = lower(trim(coalesce(
        (select pr.email from public.profiles pr where pr.id = auth.uid()),
        ''
      )))
    )
  );
$$;

-- ── Documents RLS (role-scoped read; managers/admins retain org write) ────────

drop policy if exists "org members select documents" on public.documents;
create policy "org members select documents" on public.documents
  for select
  using (public.can_read_document_row(documents));

drop policy if exists "org members write documents" on public.documents;
create policy "org members write documents" on public.documents
  for all
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = documents.org_id and m.user_id = auth.uid()
    )
    and (
      public.is_admin()
      or public.is_company_manager_for_org(documents.org_id)
      or documents.created_by = auth.uid()
      or documents.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = documents.org_id and m.user_id = auth.uid()
    )
    and (
      public.is_admin()
      or public.is_company_manager_for_org(documents.org_id)
      or documents.created_by = auth.uid()
      or documents.user_id = auth.uid()
    )
  );

drop policy if exists "org members select document items" on public.document_items;
create policy "org members select document items" on public.document_items
  for select
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_items.document_id
        and public.can_read_document_row(d)
    )
  );

drop policy if exists "org members write document items" on public.document_items;
create policy "org members write document items" on public.document_items
  for all
  using (
    exists (
      select 1
      from public.documents d
      join public.memberships m on m.org_id = d.org_id
      where d.id = document_items.document_id
        and m.user_id = auth.uid()
        and (
          public.is_admin()
          or public.is_company_manager_for_org(d.org_id)
          or d.created_by = auth.uid()
          or d.user_id = auth.uid()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      join public.memberships m on m.org_id = d.org_id
      where d.id = document_items.document_id
        and m.user_id = auth.uid()
        and (
          public.is_admin()
          or public.is_company_manager_for_org(d.org_id)
          or d.created_by = auth.uid()
          or d.user_id = auth.uid()
        )
    )
  );

drop policy if exists "org members select document events" on public.document_events;
create policy "org members select document events" on public.document_events
  for select
  using (
    exists (
      select 1
      from public.documents d
      where d.id = document_events.document_id
        and public.can_read_document_row(d)
    )
  );

-- ── Payslips RLS ──────────────────────────────────────────────────────────────

drop policy if exists "org members select payslips" on public.payslips;
create policy "org members select payslips" on public.payslips
  for select
  using (public.can_read_payslip_row(payslips));

drop policy if exists "org members write payslips" on public.payslips;
create policy "org members write payslips" on public.payslips
  for all
  using (
    exists (
      select 1 from public.memberships m
      where m.org_id = payslips.org_id and m.user_id = auth.uid()
    )
    and (
      public.is_admin()
      or public.is_company_manager_for_org(payslips.org_id)
    )
  )
  with check (
    exists (
      select 1 from public.memberships m
      where m.org_id = payslips.org_id and m.user_id = auth.uid()
    )
    and (
      public.is_admin()
      or public.is_company_manager_for_org(payslips.org_id)
    )
  );
