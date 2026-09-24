# Entitlement enforcement soak

Server gates: `requireFeature` / `requireActiveBilling` in `server/src/billing/entitlements.js`.  
Feature authz SoR: `subscriptions` via `resolveEntitlement` / `assertUserHasFeature` (never `profiles.plan`).

## Environment

| Value | Effect |
|-------|--------|
| unset / `true` | **Enforce** (default on every environment since 2026-09-24) |
| `=false` / `report` | Log only — emergency rollback |

The database guard for browser-written tables (`paidly_enforce_plan_feature`, see
[PLAN_ENTITLEMENTS.md](PLAN_ENTITLEMENTS.md)) enforces by default too. Roll back **both together**:

```sql
ALTER ROLE authenticated SET app.paidly_entitlements_enforce = 'off';  -- log-only
ALTER ROLE authenticated RESET app.paidly_entitlements_enforce;        -- enforce again
```

## Staging / Preview

1. Set `PAIDLY_ENTITLEMENTS_ENFORCE=true` on the Preview environment (also in `.env.development.example`).
2. Confirm free / expired company cannot call payroll or leave APIs (403 `UPGRADE_REQUIRED`).
3. Confirm active Business+ can.
4. Confirm UI locks match (Layout + FeatureGate use `/api/subscriptions/current`).

## Production enable (after soak)

1. Set **Vercel Production** env: `PAIDLY_ENTITLEMENTS_ENFORCE=true`.
2. Redeploy.
3. Smoke: trial owner, paid Business, expired account.
4. Keep `=false` only as an emergency rollback.

UI and EntityManager read the same subscription current payload for chrome and client writes; they do not grant access if the server would deny.
