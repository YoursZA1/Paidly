-- Add client_id and notes to payments table (fix: "Could not find the 'client_id' column of 'payments' in the schema cache")
-- Run in Supabase SQL Editor, then run: NOTIFY pgrst, 'reload schema'; (or use scripts/reload-schema-cache.sql)

-- Add client_id if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE public.payments
      ADD COLUMN client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add notes if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'notes'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN notes text;
  END IF;
END $$;

-- Reload PostgREST schema cache so the API sees the new columns
NOTIFY pgrst, 'reload schema';
