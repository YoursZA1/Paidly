# Testing Supabase (Auth, Database, Storage)

This project uses **Vitest** for unit tests. Tests cover Supabase-related error handling and mocked auth/storage behavior. Integration tests against a real Supabase project can be run separately with the right env.

## Running tests

| Command | Purpose |
|--------|---------|
| `npm test` | Run tests in watch mode |
| `npm run test:run` | Run tests once (CI-friendly) |
| `npm run test:coverage` | Run tests and generate coverage report |

## What’s tested

### Unit tests (no real Supabase)

- **`tests/unit/supabaseErrorUtils.test.js`**  
  - `getSupabaseErrorMessage`: null/undefined, string, Error, Supabase-style objects, empty message, `[object Object]` fallback.  
  - `throwIfSupabaseError`: no throw when no error; throw with normalized message and cause.  
  - `withSupabaseErrorHandling`: success passthrough; rethrow with normalized message; fallback when thrown value has no message.

- **`tests/unit/supabaseAuth.service.test.js`** (mocked client)  
  - Auth **error handling**: signInWithEmail, signOut, getSession throw with normalized message on Supabase error.  
  - **Success paths**: signInWithEmail returns normalized session; signOut resolves when no error.

- **`tests/unit/supabaseStorage.service.test.js`** (mocked client)  
  - Storage **error handling**: uploadProfileLogo throws user-friendly message on “Bucket not found” and on permission-style errors.

- **`tests/unit/supabaseDatabase.errors.test.js`**  
  - **Database/RLS**: normalization of RLS, permission denied, duplicate key, and JWT-expired style messages for consistent error handling.

Together these validate **error handling and edge cases** (permission errors, missing messages, bucket/session-style failures) without hitting Supabase.

## Development vs production

- **Development**: Run `npm run test:run` (or `npm test`) locally. Uses `vitest.config.js` env (e.g. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set to test values). No real Supabase is called in unit tests.
- **Production / CI**: Same commands. No production secrets are needed for the current unit tests. For CI, run `npm run test:run` (and optionally `npm run test:coverage`).

## Validating against a real Supabase project (optional)

To **test auth, database, and storage** against a real Supabase project (dev or prod):

1. **Create a test project** (or use a dev project) in Supabase. Apply `supabase/schema.postgres.sql` so RLS and tables match.
2. **Use a dedicated test user** (and optional test org) so you don’t pollute real data.
3. **Run manual or scripted flows** (e.g. sign in, create/read/update a client, upload a file, sign out) and assert success and error responses.
4. **Edge cases to validate**:
   - **Expired session**: Let the JWT expire or clear session; confirm the app shows a sensible message (e.g. “Session expired” or “Not authenticated”) and redirects to login or refreshes session where applicable.
   - **Permission errors**: As a non-admin, try to access another org’s resource or an admin-only endpoint; confirm RLS returns an error and the app surfaces a normalized message (no raw PostgrestError in UI).
   - **Storage**: Upload to a bucket the user can’t access; confirm a clear error (e.g. “Permission denied” or “Bucket not found”) and no service key or internal details exposed.

These checks can be documented in a separate “Manual test checklist” or automated with Playwright/Cypress and a test Supabase project if you add E2E later.

## Monitoring logs and integration issues

When running the app (`npm run dev`), watch the browser console for `console.error` (integration failures) and `console.warn` (e.g. realtime, bucket, session fallbacks). List-load and action errors now show **toasts**; if you see an error in the console without a toast, add one in that catch block. After schema or deploy changes, load main pages and trigger a failure to confirm toasts appear.

## Summary

- **Unit tests**: Supabase **auth**, **database** (error shapes), and **storage** behavior are tested via mocks and error utils; **error handling and edge cases** (expired session, permission errors, bucket/RLS) are validated in unit tests and in the error util behavior.
- **Environments**: Same test run in **development and production/CI**; optional **manual or E2E** validation against a real Supabase instance for full auth/DB/storage flows.
