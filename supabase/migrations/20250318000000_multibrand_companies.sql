-- Optional: Multi-brand support (advanced SaaS)
-- Structure: companies (id, name, logo_url) per org; invoices.company_id references which brand to use.
-- Load with: invoice.company.logo_url when company_id is set; else fall back to owner_logo_url.

-- Companies table: one or more brands per organization
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoices can optionally reference a company (brand) for logo/name; when null, use owner_* snapshot
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_org_id ON public.companies(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Org members can manage their org's companies
DROP POLICY IF EXISTS "org members select companies" ON public.companies;
CREATE POLICY "org members select companies" ON public.companies
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = companies.org_id AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "org members insert companies" ON public.companies;
CREATE POLICY "org members insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = companies.org_id AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "org members update companies" ON public.companies;
CREATE POLICY "org members update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = companies.org_id AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = companies.org_id AND m.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "org members delete companies" ON public.companies;
CREATE POLICY "org members delete companies" ON public.companies
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.org_id = companies.org_id AND m.user_id = (SELECT auth.uid())
    )
  );

-- Admin full access
DROP POLICY IF EXISTS "admin full access companies" ON public.companies;
CREATE POLICY "admin full access companies" ON public.companies
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
