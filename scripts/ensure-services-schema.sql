-- Ensure services table has all required columns (fix "Database schema mismatch" when adding services)
-- Run in Supabase SQL Editor. If the services table does not exist, run supabase/schema.postgres.sql first.

-- Add any missing columns to public.services (safe to run multiple times)
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS item_type text DEFAULT 'service';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS default_unit text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS default_rate numeric(12,2) DEFAULT 0;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS tax_category text DEFAULT 'standard';
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS rate numeric(12,2) DEFAULT 0;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unit_of_measure text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price numeric(12,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS billing_unit text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS unit_type text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS cost_rate numeric(12,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS cost_type text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS default_cost numeric(12,2);
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS pricing_type text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS min_quantity integer DEFAULT 1;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS estimated_duration text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS requirements text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price_locked boolean DEFAULT false;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price_locked_at timestamptz;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS price_locked_reason text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS last_used_date timestamptz;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS type_specific_data jsonb;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
