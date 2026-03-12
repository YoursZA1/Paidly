# Supabase setup (user + admin)

**Full step-by-step guide:** [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

## Quick start

1. **Create a Supabase project** at [app.supabase.com](https://app.supabase.com).
2. **Set env vars** (project root and `server/`):
   - Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
3. **Apply schema:** Run `supabase/schema.postgres.sql` in SQL Editor.
4. **Apply migrations:** Run `supabase/migrations/20240308120000_add_profiles_payfast_columns.sql` (or the SQL inside it).
5. **Storage:** Create bucket `invoicebreek` if not created by schema.
6. **Auth:** Enable Email; optionally enable Google and Apple (see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md#6-auth-providers)).
7. **Verify:** `node scripts/verify-supabase-config.js`

## CLI (optional)

- Link project: `supabase link --project-ref YOUR_PROJECT_REF`
- Deploy Edge Function: `supabase functions deploy payfast-itn`
- Set secret: `supabase secrets set PAYFAST_PASSPHRASE=your_passphrase`

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for Edge Functions, PayFast ITN URL, and admin role.
