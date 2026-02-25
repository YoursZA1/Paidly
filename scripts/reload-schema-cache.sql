-- Reload PostgREST schema cache (fixes "Could not find the table 'public.invoices' in the schema cache")
-- Run this in Supabase SQL Editor after creating new tables or if the app says "Invoices table missing or API cache stale".
-- 
-- IMPORTANT: After running this, wait 30-60 seconds before testing. PostgREST needs time to reload.

-- Method 1: Notify PostgREST to reload schema (recommended)
notify pgrst, 'reload schema';

-- Method 2: Check notification queue usage
select pg_notification_queue_usage();

-- Method 3: Verify tables exist (diagnostic)
SELECT 
  table_name,
  table_schema
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('invoices', 'invoice_items', 'payments', 'clients', 'services', 'quotes')
ORDER BY table_name;

-- If tables exist but still getting cache errors:
-- 1. Wait 30-60 seconds after running NOTIFY
-- 2. Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
-- 3. Check that VITE_SUPABASE_URL in .env matches your Supabase project URL
-- 4. Try restarting your dev server
-- 5. If still failing, restart PostgREST from Supabase Dashboard → Settings → API → Restart API
