# Scheduled payment reminders (cron)

The app includes a **secured HTTP endpoint** for future **server-side** reminder runs. The in-app **PaymentReminderScheduler** (once per day while a user has the app open) remains a best-effort fallback.

## Endpoint

- **URL:** `GET` or `POST` `/api/cron/payment-reminders`
- **Auth:** `Authorization: Bearer <CRON_SECRET>`
- **Env:** `CRON_SECRET` — long random string; **never commit it**. Minimum length enforced in code (8+ characters).

Example (manual trigger):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://www.paidly.co.za/api/cron/payment-reminders"
```

## Vercel Cron

1. Add **`CRON_SECRET`** in the Vercel project (Production + Preview if needed).
2. `vercel.json` includes a daily schedule (`0 8 * * *` = 08:00 UTC). Adjust the cron expression as needed.
3. Redeploy. Vercel invokes the route and sends `Authorization: Bearer <CRON_SECRET>` when **`CRON_SECRET`** is set in the project.

**Note:** Cron Jobs availability depends on your Vercel plan. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs).

## Supabase (alternative)

If you prefer the database to trigger HTTP on a schedule:

1. Enable **`pg_cron`** (and optionally **`pg_net`** / HTTP) on your Supabase project if available, **or** use Supabase [Edge Function schedules](https://supabase.com/docs/guides/functions/schedule-functions).
2. Call the same URL with the same `Authorization` header (store the secret in Supabase Vault or env, not in SQL literals in production).

Example pattern (conceptual — adjust to your Supabase version and security model):

```sql
-- Requires pg_cron + http extension; syntax varies by platform
-- select cron.schedule(
--   'payment-reminders',
--   '0 8 * * *',
--   $$ select net.http_post(
--     url := 'https://www.paidly.co.za/api/cron/payment-reminders',
--     headers := '{"Authorization": "Bearer <CRON_SECRET>"}'::jsonb
--   ) $$
-- );
```

## Implementing the batch

The handler in `api/cron/payment-reminders.js` currently returns a **placeholder** result. To run reminders for all tenants without a browser:

1. **Persist** `reminder_settings` in the database (e.g. `profiles.reminder_settings` JSONB or inside `business`) so the cron can read it with the **service role**.
2. Query **invoices** (and **clients**) per `org_id` with status `sent` / `partial_paid` / `overdue`.
3. Reuse the same date rules as `PaymentReminderService` and send email via **Resend** (`RESEND_API_KEY`, `RESEND_FROM`), mirroring `sendEmail` logic without `window.location` (use `https://www.paidly.co.za` or `CLIENT_ORIGIN` for public invoice links).

## Related files

- `api/cron/payment-reminders.js` — secured route
- `src/components/reminders/PaymentReminderService.jsx` — client-side rules (reference)
- `src/components/reminders/PaymentReminderScheduler.jsx` — daily client trigger
