# Supabase setup (user + admin)

This guide aligns the project with the Supabase bucket name `invoicebreek` and admin role claims stored in auth app metadata.

## 1) Create or open your Supabase project

- Use your existing project.
- Enable email/password auth (Auth -> Providers).

## 2) Apply schema and policies

In Supabase SQL editor, run the schema from:

- supabase/schema.postgres.sql

This creates tables, RLS policies, and the `invoicebreek` storage bucket entry.

## 3) Create storage bucket

If the bucket was not created by SQL, create it manually:

- Storage -> Buckets -> New bucket -> name: `invoicebreek`
- Keep it private (recommended). Signed URLs are used in the app.

## 4) Set frontend env vars

Create `.env.local` (or update your env) at repo root:

```
VITE_SERVER_URL=http://localhost:5179
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_SUPABASE_STORAGE_BUCKET=invoicebreek
```

## 5) Set backend env vars

Create `server/.env`:

```
PORT=5179
CLIENT_ORIGIN=http://localhost:5173
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

## 6) Create users and assign admin role

1) Create users in Auth -> Users (or from your app).
2) Assign the admin role using SQL (run in Supabase SQL editor):

```
update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
where email = 'admin@example.com';
```

For standard users, you can omit the role or set it to "user".

## 7) Optional seed data

After you have an org created, you can seed sample data by replacing placeholders
in a SQL script. Example template (replace ORG_ID):

```
insert into public.clients (org_id, name, email)
values ('ORG_ID', 'Acme Co', 'billing@acme.com');
```

## 8) Restart services

- Frontend: `npm run dev`
- Backend: `npm run server`
