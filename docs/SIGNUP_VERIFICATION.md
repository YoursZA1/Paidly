# User signup configuration and table verification

This document confirms how signup is configured and which tables store new user information.

---

## 1. Signup flow (frontend → Supabase)

| Step | Where | What happens |
|------|--------|--------------|
| 1 | **Signup.jsx** | User submits Step 1: full name, email, password, confirm password. Optional: company name, address, phone. Plan selected in Step 2. |
| 2 | **SupabaseAuthService.signUpWithEmail()** | `supabase.auth.signUp({ email, password, options: { data: profile } })` with `profile`: `full_name`, `company_name`, `company_address`, `phone`, `plan`, `role`. |
| 3 | **Supabase Auth** | Creates row in `auth.users`. Metadata is stored in `raw_user_meta_data` (and/or `user_metadata`). |
| 4 | **DB trigger** | `on_auth_user_created` (after insert on `auth.users`) runs `public.handle_new_user()`. |
| 5 | **handle_new_user()** | Inserts into `public.profiles`, creates one row in `public.organizations`, one row in `public.memberships` (owner). |

---

## 2. Tables that capture new user signup information

### auth.users (Supabase managed)

- **id** (uuid), **email**, **encrypted_password**, **email_confirmed_at**, etc.
- **raw_user_meta_data** (jsonb): signup form data sent as `options.data` — `full_name`, `company_name`, `company_address`, `phone`, `plan`, `role`.

### public.profiles (one row per user, id = auth.users.id)

| Column | Source | Notes |
|--------|--------|--------|
| id | auth.users.id | PK, FK to auth.users |
| email | new.email | From auth |
| full_name | raw_user_meta_data->>'full_name' | From signup form |
| avatar_url | raw_user_meta_data->>'avatar_url' | Optional |
| logo_url | raw_user_meta_data->>'logo_url' | Optional |
| company_name | raw_user_meta_data->>'company_name' | From signup form |
| company_address | raw_user_meta_data->>'company_address' | From signup form |
| phone | raw_user_meta_data->>'phone' | From signup form |
| subscription_plan | raw_user_meta_data->>'plan' or 'subscription_plan' | From signup plan choice (default 'starter') |
| currency | raw_user_meta_data->>'currency' or 'USD' | Default USD |
| timezone | raw_user_meta_data->>'timezone' or 'UTC' | Default UTC |
| invoice_template | (default 'classic') | Set in trigger/schema |
| invoice_header | (default null) | Set in schema |
| created_at, updated_at | now() | Set by DB |

### public.organizations (one per new user)

| Column | Source |
|--------|--------|
| id | uuid_generate_v4() |
| name | raw_user_meta_data->>'org_name' or 'My Organization' |
| owner_id | auth.users.id |
| created_at | now() |

### public.memberships (links user to org)

| Column | Source |
|--------|--------|
| id | uuid_generate_v4() |
| org_id | From the organization just created |
| user_id | auth.users.id |
| role | 'owner' |
| created_at | now() |

---

## 3. Checklist: is signup configured and are tables available?

- [ ] **Supabase project**  
  - Same project as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the app.

- [ ] **Tables exist**  
  - `public.profiles` (with columns above, including `company_address`, `phone`, `subscription_plan`).  
  - `public.organizations`.  
  - `public.memberships`.

- [ ] **Trigger and function**  
  - Function `public.handle_new_user()` exists and inserts into `profiles`, `organizations`, and `memberships` as above.  
  - Trigger `on_auth_user_created` on `auth.users` runs `public.handle_new_user()` after insert.

- [ ] **RLS**  
  - Policies allow: profile read/update by own `id = auth.uid()`; org/membership access as per your app (e.g. admin full access, members by org).

If signup fails with **"Database error saving new user"** or **"Signup failed due to database setup"**:

1. Open **Supabase Dashboard** → **SQL Editor**.
2. Run **`scripts/fix-signup-trigger.sql`** in full (adds missing profile columns and recreates the trigger/function).
3. If you get `relation "public.profiles" does not exist`, run the base schema first: **`supabase/schema.postgres.sql`** (at least the parts that create `profiles`, `organizations`, `memberships`, and the trigger), then run **`scripts/fix-signup-trigger.sql`** again.

See **docs/SIGNUP_DATABASE_FIX.md** for step-by-step instructions.

---

## 4. Quick verification query (Supabase SQL Editor)

After running the fix script (or full schema), you can confirm tables and trigger:

```sql
-- Tables exist and profiles has expected columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- Trigger exists
select tgname, tgrelid::regclass
from pg_trigger
where tgname = 'on_auth_user_created';
```

Expected: `profiles` has (among others) `id`, `email`, `full_name`, `company_name`, `company_address`, `phone`, `subscription_plan`, `currency`, `timezone`; trigger `on_auth_user_created` on `auth.users`.

---

## See also

- **[DEV_SIGNUP_TESTING.md](./DEV_SIGNUP_TESTING.md)** — dev Supabase rate limits, loading/double-submit, throttles, and test email practices for Paidly.
