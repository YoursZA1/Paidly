-- Ensure clients table exists and has all required columns (fix "Database schema mismatch")
-- Run this entire file in Supabase SQL Editor.
-- If you get an error about "organizations" or "relation does not exist", run supabase/schema.postgres.sql first.

create extension if not exists "uuid-ossp";

-- Create clients table if it does not exist (matches supabase/schema.postgres.sql)
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

-- Add any missing columns (safe to run multiple times; no-op if column exists)
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_person text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tax_id text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS fax text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS alternate_email text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30';
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS payment_terms_days integer DEFAULT 30;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS follow_up_enabled boolean DEFAULT true;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS total_spent numeric(12,2) DEFAULT 0;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS last_invoice_date timestamptz;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- If you had an old "tax_number" column, copy to tax_id and drop (optional, uncomment if needed):
-- UPDATE public.clients SET tax_id = tax_number WHERE tax_id IS NULL AND tax_number IS NOT NULL;
-- ALTER TABLE public.clients DROP COLUMN IF EXISTS tax_number;
