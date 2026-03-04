# Fix signup: "Signup failed due to database setup"

If new users see **"Signup failed due to database setup"** (or "Database error saving new user"), the Supabase trigger that creates their profile and org after signup needs to be updated.

## Steps (you are the administrator)

1. **Open Supabase**  
   Go to [Supabase Dashboard](https://supabase.com/dashboard) and open the project that backs Paidly (the one whose URL and anon key are in your app's `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

2. **Open SQL Editor**  
   In the left sidebar, click **SQL Editor**.

3. **Run the fix script**  
   - Open the file **`scripts/fix-signup-trigger.sql`** in this repo.  
   - Copy its **entire** contents (from `-- Fix signup` to the last `handle_new_user();`).  
   - Paste into a new query in the SQL Editor.  
   - Click **Run** (or press Cmd/Ctrl+Enter).

4. **If you see an error**  
   If you get `relation "public.profiles" does not exist`, the base schema has not been applied. Run **`supabase/schema.postgres.sql`** in the SQL Editor first (at least the parts that create `profiles`, `organizations`, `memberships`, and the trigger), then run **`scripts/fix-signup-trigger.sql`** again.

5. **Try signup again**  
   Create an account again at your app's signup page. Signup should complete without the database setup error.

## What the script does

- Adds **`company_address`** to `public.profiles` if it's missing.  
- Updates the **`handle_new_user`** trigger so it fills `profiles`, creates an **organization**, and adds a **membership** (including `company_address` from signup).  
- Recreates the **`on_auth_user_created`** trigger on `auth.users` so it uses the new function.

After this, new signups get a profile, org, and membership automatically.
