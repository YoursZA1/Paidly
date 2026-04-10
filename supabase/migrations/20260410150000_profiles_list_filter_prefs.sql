-- UI list filters (invoices / clients / expenses) synced per user for cross-device continuity.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS list_filter_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.list_filter_prefs IS
  'Client-side list filter state: { "invoices": {...}, "clients": {...}, "expenses": {...} }. Merged server-side; users may only update their own row via RLS.';
