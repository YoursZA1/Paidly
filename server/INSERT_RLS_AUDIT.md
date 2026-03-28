# Client `insert` / upsert audit (RLS reminder)

Server-side **`supabaseAdmin`** bypasses RLS — only use it in **`server/src/index.js`** (and trusted jobs) with explicit checks (e.g. PayFast ITN loads invoice then inserts `payments` with `org_id` from DB).

Browser **`supabase.from(...).insert`** uses the **anon key + user JWT**. Those rows **must** be constrained by **RLS** so a tampered client cannot write arbitrary `user_id` / `org_id`.

## Grep hits (`src/`)

| Location | Table / action | RLS expectation |
|----------|----------------|-----------------|
| `src/api/businessGoals.js` | `business_goals` insert | Policies tie rows to `auth.uid()` / org membership. |
| `src/services/ActivityNotificationService.js` | `notifications` insert | Same — user/org scoped. |
| `src/api/waitlistClient.js` | `waitlist_signups` insert | Public insert policy only for intended columns; no cross-tenant reads. |
| `src/pages/Inventory.jsx` | `inventory_movements`, `services` | Inserts should include `org_id` / keys RLS allows; verify policies. |
| `src/api/customClient.js` | `profiles` upsert, generic `.insert` | **`id` must match `auth.uid()`** for profile rows; entity inserts use RLS on org. |

## Action items

1. In **Supabase Dashboard → Authentication → Policies**, confirm every table above has **RLS enabled** and policies that reference **`auth.uid()`** or org membership — not `USING (true)` for writes.
2. Never rely on the SPA to send the correct `user_id`; enforce with **defaults** (`DEFAULT auth.uid()`) or **checks** + RLS.
3. Re-audit after **new** `.insert(` / `.upsert(` call sites.
