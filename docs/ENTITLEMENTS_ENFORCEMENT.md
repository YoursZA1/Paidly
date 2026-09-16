# Entitlement enforcement soak

Server gates: `requireFeature` / `requireActiveBilling` in `server/src/billing/entitlements.js`.  
Feature authz SoR: `subscriptions` via `resolveEntitlement` / `assertUserHasFeature` (never `profiles.plan`).

## Environment

| Value | Effect |
|-------|--------|
| `PAIDLY_ENTITLEMENTS_ENFORCE=true` | Block unauthorized API access |
| `=false` / `report` | Log only (escape hatch) |
| unset + Vercel **preview** | Enforce |
| unset + Vercel **production** | Report-only + one-time warn log |

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
