# QA Runbook: Admin Multi-Channel Messaging

This runbook validates the admin messaging upgrade end-to-end:

- Admin can send via in-app and/or email
- Delivery tracking is written per user per channel
- User inbox and unread badge reflect `message_deliveries` (`in_app`)
- Backend API is the source of truth (`POST /api/admin/send-message`)

Use this as a strict checklist for release validation.

---

## 1) Scope and Pass Criteria

### In Scope

- Admin send flow from `AdminPlatformMessages`
- API endpoint: `POST /api/admin/send-message`
- DB writes to:
  - `admin_platform_messages`
  - `message_deliveries`
- User-side visibility:
  - `Messages` page admin inbox
  - notification badge / mark-read behavior

### Pass Criteria (all required)

1. Correct rows are created in `admin_platform_messages`.
2. Correct rows are created in `message_deliveries` for selected channels only.
3. `message_deliveries.status` transitions correctly by channel.
4. In-app unread/read behavior only affects the current user.
5. Email failures/skips are reflected in `message_deliveries` and API response counts.
6. No linter/runtime errors in tested flows.

---

## 2) Test Data Setup

Prepare these accounts:

- `admin_a` (role with access to `/admin-v2/messages`)
- `user_1` (valid auth email)
- `user_2` (valid auth email)

Optional negative-path users:

- `user_no_email` (if possible in test env; otherwise skip)
- `user_invalid_email` (if possible; otherwise simulate via env)

Record IDs:

- `admin_id`
- `user_1_id`
- `user_2_id`

Base message payload for manual/API tests:

- `subject`: `QA Multi-Channel Test`
- `content`: `This is a QA validation message.`

---

## 3) Environment Preconditions

1. Apply migration:
   - `supabase/migrations/20260423110000_admin_message_multichannel_delivery.sql`
2. Ensure API server path is available:
   - `POST /api/admin/send-message`
3. For email-positive tests, set:
   - `RESEND_API_KEY`
   - `RESEND_FROM`
4. Clean baseline (recommended):
   - Use a unique subject prefix per run, e.g. `QA_RUN_2026-04-23_01`.

---

## 4) Verification SQL Snippets

Use these after each test case (replace placeholders).

```sql
-- Latest messages for a test subject
select id, recipient_id, sender_id, subject, content, send_email, send_in_app, status, created_at
from public.admin_platform_messages
where subject like 'QA_RUN_2026-04-23_01%'
order by created_at desc;
```

```sql
-- Delivery rows for those messages
select d.id, d.message_id, d.user_id, d.channel, d.status, d.sent_at, d.read_at, d.created_at, d.updated_at
from public.message_deliveries d
join public.admin_platform_messages m on m.id = d.message_id
where m.subject like 'QA_RUN_2026-04-23_01%'
order by d.created_at desc, d.channel;
```

```sql
-- Count deliveries by channel/status
select d.channel, d.status, count(*) as rows
from public.message_deliveries d
join public.admin_platform_messages m on m.id = d.message_id
where m.subject like 'QA_RUN_2026-04-23_01%'
group by d.channel, d.status
order by d.channel, d.status;
```

---

## 5) Strict Test Matrix

### TC-01: In-app only (single recipient)

**Goal:** verify only `in_app` delivery row is created and marked sent.

1. Login as `admin_a`.
2. Open admin messages page.
3. Compose to `user_1` with:
   - `Send to Dashboard = true`
   - `Send via Email = false`
4. Send.

Expected API/UI:

- Success toast.
- API response has:
  - `sent = 1`
  - `failedEmail = 0`
  - `skippedEmail = 0` or unchanged for non-email path.

Expected DB:

- `admin_platform_messages`:
  - one row for `recipient_id = user_1_id`
  - `send_in_app = true`
  - `send_email = false`
  - `status = 'sent'`
- `message_deliveries`:
  - exactly one row:
    - `channel = 'in_app'`
    - `status = 'sent'`
    - `sent_at is not null`
    - `read_at is null` initially

---

### TC-02: Email only (single recipient)

**Goal:** verify only `email` delivery row is created.

1. Compose to `user_1` with:
   - `Send to Dashboard = false`
   - `Send via Email = true`
2. Send.

Expected DB:

- `admin_platform_messages`:
  - `send_in_app = false`
  - `send_email = true`
  - `status = 'sent'`
- `message_deliveries`:
  - exactly one row:
    - `channel = 'email'`
    - `status in ('sent','failed')` depending on email outcome
    - if `status='sent'` then `sent_at is not null`

Expected API counters:

- email success path: `failedEmail = 0`, `skippedEmail = 0`
- email fail path: `failedEmail >= 1`
- email skipped path (no config/no address): `skippedEmail >= 1`

---

### TC-03: Both channels (single recipient)

**Goal:** verify dual channel fan-out.

1. Compose to `user_1`:
   - `Send to Dashboard = true`
   - `Send via Email = true`
2. Send.

Expected DB:

- `admin_platform_messages`: one row, both booleans true, `status='sent'`.
- `message_deliveries`: exactly two rows for same `message_id`, `user_id`:
  - row A: `channel='in_app'`, `status='sent'`, `sent_at not null`
  - row B: `channel='email'`, `status in ('sent','failed')`

Constraint check:

- Unique composite `(message_id, user_id, channel)` is respected (no duplicates).

---

### TC-04: Multi-recipient fan-out

**Goal:** verify one message record per recipient and per-channel delivery rows.

1. Send same payload to `user_1` and `user_2` (recipient list path).
2. Use both channels enabled.

Expected DB:

- `admin_platform_messages`: 2 rows (one per recipient).
- `message_deliveries`: 4 rows total:
  - 2 `in_app`
  - 2 `email`

Expected API response:

- `recipients = 2`
- `sent = 2`

---

### TC-05: Validation - no channel selected

**Goal:** hard input validation.

1. Attempt send with:
   - `send_in_app = false`
   - `send_email = false`

Expected:

- API returns `400`.
- Error text includes: `Select at least one delivery channel`.
- No new rows in either table.

---

### TC-06: Validation - empty content

1. Attempt send with blank `content`.

Expected:

- API returns `400` with `content is required`.
- No rows inserted.

---

### TC-07: Validation - invalid recipient id(s)

1. Call API with invalid UUID in `recipient_id` or `recipient_ids`.

Expected:

- API returns `400` with `Invalid recipient_id(s)` or equivalent.
- No rows inserted.

---

### TC-08: User inbox visibility (in-app delivery source)

**Goal:** user sees only own in-app messages from `message_deliveries`.

1. Ensure at least one unread in-app delivery exists for `user_1`.
2. Login as `user_1`.
3. Open `Messages` page.

Expected UI:

- Admin inbox section shows message subject/content.
- Unread badge count increments correctly.

Expected DB mapping:

- Displayed message corresponds to `message_deliveries.channel='in_app'` rows joined to `admin_platform_messages`.

---

### TC-09: Mark read behavior (single + all read)

1. As `user_1`, mark one item read from notification bell.
2. Mark all read.

Expected DB:

- Only `message_deliveries` rows for `user_1` are updated:
  - `read_at is not null`
  - `status = 'read'`
- No rows for `user_2` are changed.

Required SQL assertion:

```sql
select user_id, channel, status, count(*)
from public.message_deliveries
where channel = 'in_app'
group by user_id, channel, status
order by user_id, status;
```

Confirm status movement occurred only for active user.

---

### TC-10: RLS boundary (non-admin cannot send)

1. Login as non-admin user.
2. Call `POST /api/admin/send-message`.

Expected:

- `403` (or auth deny body from admin gate).
- No rows inserted.

---

## 6) Expected Row Outcome Reference

For each successful send to 1 recipient:

- In-app only: `admin_platform_messages=1`, `message_deliveries=1`
- Email only: `admin_platform_messages=1`, `message_deliveries=1`
- Both: `admin_platform_messages=1`, `message_deliveries=2`

For N recipients:

- `admin_platform_messages = N`
- `message_deliveries = N * selected_channels_count`

Status expectations:

- `admin_platform_messages.status`: `pending -> sent` in same request path
- `message_deliveries`:
  - `in_app`: `sent` immediately, then `read` when user reads
  - `email`: `pending -> sent|failed` based on mail result

---

## 7) Failure Triage Guide

If send succeeds but no in-app message appears:

1. Query `message_deliveries` for `channel='in_app'`.
2. Check RLS/policies exist and user auth id matches `user_id`.
3. Verify client query joins to `admin_platform_messages`.

If email not delivered:

1. Check API response counters (`failedEmail`, `skippedEmail`).
2. Inspect server logs for `[admin/send-message] email failed`.
3. Verify `RESEND_API_KEY`, `RESEND_FROM`, and sender domain setup.

If unread badge mismatches:

1. Compare UI unread count vs SQL count where:
   - `channel='in_app'`
   - `read_at is null`
2. Verify mark-read writes include `user_id` filter.

---

## 8) Release Sign-Off Checklist

- [ ] TC-01 through TC-10 passed
- [ ] SQL evidence captured for each case
- [ ] No unauthorized cross-user read/update observed
- [ ] Email fail/skip behavior documented and acceptable
- [ ] Product owner sign-off complete

