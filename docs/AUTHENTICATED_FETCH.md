# Authenticated `fetch` in the browser

## Use this

For calls to **your** APIs where a missing or expired session may return **401**:

- **`apiRequest(url, init)`** — preferred name; same as `fetch`, plus 401 → global sign-out / redirect.
- **`safeFetch(url, init)`** — identical; kept for older imports.
- **`apiRequestJson(url, init)`** — convenience: parses JSON and throws on non-OK (401 still runs the session handler first).

Import from `@/utils/apiRequest`.

## Use raw `fetch` instead

- Public or token-in-URL resources (e.g. public invoice/PDF viewers).
- **Client portal** (`clientPortalClient.js`): Bearer is a **portal** token, not the Supabase app session—`apiRequest` would wrongly trigger main-app sign-out on 401.
- Third-party origins (payment providers, analytics, CDNs).
- `GET` for static assets.

## Backend axios

Server API modules should keep using **`backendApi`** from `@/api/backendClient` (401 interceptor already installed).

## Lint

In `src/api/**/*.js` (except public guest clients), ESLint **warns** on bare `fetch(` so new code defaults to `apiRequest`. Suppress with `eslint-disable-next-line` only when the call is intentionally public or third-party.
