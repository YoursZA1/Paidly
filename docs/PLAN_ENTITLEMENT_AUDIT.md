# Package / subscription / entitlement audit — 2026-09-21

Scope: every place Paidly decides "which package is this account on, and what may it do".
Source for every claim is the code on `fix/admin-escalation-billing-payroll-hr` @ `56d58fc`.
The live database could not be queried from this machine (Supabase CLI lacks privileges), so
per-account facts come from the reconciliation report in `supabase/scripts/plan_reconciliation_report.sql`.

---

## I. Root cause of the screenshot (read this first)

The sidebar and the "Change your plan" screen read **two different sources**:

| Surface | Reads | Result for the account in the screenshot |
|---|---|---|
| Sidebar badge, nav locks ("Upgrade to Starter") | `useEntitlementAccess` → `GET /api/subscriptions/current` → `subscriptions` row → `accessGranted` | `accessGranted = false` → plan `"none"` → "Free plan", every paid item locked. Cash Flow maps to `reports_basic`, whose lowest tier is Starter → "Upgrade to Starter". |
| Change your plan (`SubscriptionSettings.jsx:86`) | `normalizePaidPackageKey({...authUser, ...profile})` → **`profiles.plan`** | `growth` → "CURRENT" on Growth. |
| Billing & invoices (`BillingAndInvoices.jsx:85,157`) | `profiles.plan` | Growth |

So the company has **no subscription that grants access** (none, expired trial, or only a pending
checkout), while `profiles.plan` says `growth`. Three code paths can produce exactly that state:

1. **Admin Users page writes `profiles.plan` directly.** `UserFormDialog` / `UsersPage` call
   `paidly.entities.PlatformUser.update()` → direct PostgREST `profiles` update (admin JWT), and the
   Express routes `PUT /api/admin/users/:id` and `POST /api/admin/users/bulk-update` do the same with the
   service role. None of them touch `subscriptions`. They even set `subscription_status='active'`,
   `is_pro=true`. The profile says Growth; the subscription is unchanged.
2. **The `subscriptions → profiles` mirror trigger copies *every* row write, including pending checkouts.**
   `sync_profile_from_subscription_row()` (`20260820200000_…sql:412`) fires on insert/update of any
   `subscriptions` row. `POST /api/subscriptions/create` inserts a `pending` `growth_monthly` row when a
   user opens PayFast checkout. The trigger then writes `profiles.plan='growth'`, even though a pending row
   grants no access and the access-granting row (e.g. an expired Starter trial) is a different row.
   An abandoned Growth checkout after the trial ended is enough to reproduce the screenshot.
3. **The mirror only follows the last-written row**, not the row the server actually picks for access
   (`pickAccessSubscriptionRow`). Any newer non-access row (failed, pending, expired) overwrites the profile.

Which of these hit this specific account needs the reconciliation report
(`supabase/scripts/plan_reconciliation_report.sql`). The fix removes all three.

A fourth defect makes the mirror drift further: the trigger is `AFTER … UPDATE OF plan, current_plan,
status, user_id` only, so changes to `plan_slug`, `plan_family`, trial or grace dates never reached profiles,
and it only ever updated the row's `user_id` profile (the owner), never other members.

---

## A. Current architecture (as built)

```
shared/planFeatures.js  ── FAMILY_FEATURES / FAMILY_LIMITS / tier ranks (canonical, good)
shared/plans.js         ── slugs, prices, legacy aliases (canonical, good)
public.plans            ── DB catalog rows (amounts used by checkout + ITN)
        │
subscriptions (company_id, user_id, status, plan_slug, plan_family, trial_*, grace_*, admin_override)
        │                                   │
        │ server: resolveEntitlement()      │ trigger: sync_profile_from_subscription_row()
        ▼                                   ▼
server gates (requireFeature,        profiles.plan / subscription_plan / subscription_status / is_pro
assertUserHasFeature)                        │
        │                                     │ read by ~25 client files (display AND gating)
GET /api/subscriptions/current                ▼
        │                              Change-plan page, Billing page, PayRun, POS, MyPayroll,
        ▼                              ItemPermissions, CatalogSync, planLimits, UpgradeScreen,
useEntitlementAccess (nav, badge)      expired-lock, Dashboard stats
```

The server side is already mostly right: `server/src/billing/entitlements.js` resolves from
`subscriptions` only and `featureGate.js` explicitly ignores `profiles.plan`. The client is split.

## B/C. Every package / plan data source

| Source | Kind | Verdict |
|---|---|---|
| `shared/planFeatures.js` | features + limits per family | **Canonical entitlement map** |
| `shared/plans.js` | slugs, prices (fallback), legacy aliases | **Canonical catalog** (fallback prices match `public.plans`) |
| `shared/planMarketing.js` | names, bullets, CTAs | Display copy only |
| `public.plans` table | amounts for checkout / ITN | **Canonical price SoR** (server validates amount against it) |
| `subscriptions` row | package + status of a company | **Canonical billing SoR** |
| `profiles.plan`, `subscription_plan`, `subscription_status`, `is_pro`, `trial_*` | mirror | Must become display-only compatibility |
| `auth.users.user_metadata.plan` | written by ITN `syncAuthUserPlanMetadata` + signup | Untrusted (user-writable); display only |
| `src/data/planDefaults.js` + `src/data/planLimits.js` | second catalog, **overridable from `localStorage`** (`breakapi_plan_definitions`) | Duplicate — used by `CreateAccountDialog`, `PlanSelector`, `ItemPermissionsService`, `SubscriptionService` |
| `src/components/subscription/FeatureGate.jsx` `FEATURE_TIERS`, `getRequiredPlan` | hand-written tier table | Duplicate of `requiredTierForFeature` |
| `src/services/PlanManagementService.js` | admin "edit plan" in localStorage | Duplicate; changes nothing server-side |

## D. `profiles.plan` / `subscription_plan` / `subscription_status` / `is_pro` usages

| File | Use | Classification |
|---|---|---|
| `src/components/subscription/SubscriptionSettings.jsx:86` | CURRENT badge | **Display — wrong source (root cause)** |
| `src/pages/BillingAndInvoices.jsx:85,157,177` | current plan + expired label | Display — wrong source |
| `src/hooks/useEntitlementAccess.js:19` | provisional plan before subscription loads | **Gating (UI) from profile** |
| `src/pages/Layout.jsx:952` | nav fallback before entitlement ready | Gating (UI) from profile |
| `src/pages/Layout.jsx:1276` + `lib/subscriptionPlan.js:isSubscriptionExpired` | full-app "expired" lock | **Gating from `profiles.subscription_status`** |
| `src/pages/PayRun.jsx:34`, `MyPayroll.jsx:27`, `POS.jsx:69` | feature checks | Gating (UI) from profile |
| `src/services/ItemPermissionsService.js:374,403`, `CatalogSyncService.js:431,538` | rate-edit limits | Gating (UI) from profile |
| `src/data/planLimits.js:90` | `getUserPlan` | Gating from profile |
| `src/components/dashboard/DashboardSubscriptionBanner.jsx:46` | banner fallback | Display fallback |
| `src/pages/Dashboard.jsx:281` | owner plan label | Display |
| `src/api/entity/EntityManager.js:187` | deprecated diagnostic | Unused for gating once ready |
| `src/pages/UsersPage.jsx`, `components/users/UserFormDialog.jsx`, `api/paidlyDataClient.js` (`PlatformUser`) | admin plan edit | **Admin write to profile only (root cause 1)** |
| `server/src/index.js` `PUT /api/admin/users/:id`, `POST /api/admin/users/bulk-update` | admin plan edit | **Admin write to profile only (root cause 1)** |
| `server/src/payfastSubscriptionItn.js:316` | mirror after successful payment | Mirror (fine, redundant with trigger) |
| `start_owner_system_trial` | sets profile `starter` / `trial` | Mirror |
| `sync_profile_from_subscription_row` | mirror | **Mirrors wrong row (root cause 2/3)** |
| `server/src/featureGate.js:fetchProfilePlanSlug` | deprecated, unused for authz | OK |
| Admin dashboards (`SubscriptionService`, `AccountsManagementService`, `Dashboard` admin stats, `adminPlatformUsersList`) | reporting | Display/reporting from profile — misreports revenue/plan counts |

## E. Entitlement implementations

1. **Server** `resolveEntitlement()` — subscriptions SoR, company-scoped. Good.
2. **Client** `deriveEntitlementFromSubscriptionCurrent()` / `clientHasFeature()` — mirrors the server
   payload, but falls back to `profiles.plan` while loading.
3. **Client** `hasFeatureAccess(userPlan, …)` in `FeatureGate.jsx` — profile-driven where callers pass a profile plan.
4. **Client** `planLimits.js` — localStorage-overridable catalog.

## F. Feature gates

Server-enforced: invoice email send (`sendEmailApi`, `index.js:930`), payroll/payslips/leave
(`payrollGate`), POS (`posEntitlement` → `requireFeature("pos")`), POS integrations
(`requireFeature("integrations")`), team invite (`requireActiveBilling` + seats, **Vercel route only**).

Client-only (PostgREST writes gated only by `EntityManager.assertSupabaseTableFeatureGate`):
inventory, expenses, purchase orders, recurring invoices, VAT reports, departments/approvals,
advanced reports. RLS does not check plan. A Starter user calling PostgREST directly can write these tables.

`PAIDLY_ENTITLEMENTS_ENFORCE` unset on Vercel **production** = report-only for `requireFeature` /
`requireActiveBilling` (logs, never blocks). `assertUserHasFeature` (payroll, email) always enforces.

## G. Duplicated package definitions

`FeatureGate.jsx` `FEATURE_TIERS` + `getRequiredPlan`; `planDefaults.js`/`planLimits.js`;
`PlanManagementService`; `normalizeSignupPlan` in `Signup.jsx`; `normalizePaidPackageKey` in
`subscriptionPlan.js`; the SQL `CASE` family mapping in the mirror trigger (acceptable — DB needs its own).

## H. Mismatches found

1. Plan page / billing page use profile; nav uses subscription (screenshot).
2. Admin plan edits change profile, not subscription.
3. Mirror trigger follows pending/non-access rows.
4. Mirror only updates the **owner's** profile (`NEW.user_id`); other members' `profiles.plan` stays
   whatever it was, and every client surface that reads the profile shows them a different package.
5. **Trials ignore the chosen package**: `start_owner_system_trial` always creates a Starter trial,
   although signup sends `plan` in metadata. A Growth signup gets Starter entitlements.
6. The full-app "expired" lock reads `profiles.subscription_status`, not the subscription.
7. Seat limit: checked only on the Vercel `team-invite` route (Express `POST /api/company/invite` has
   none), and it counts **all** memberships, including employee records with no login, so a Business
   company with 5 payroll employees cannot invite a single user.
8. `resolveUserCompanyId` (subscription read) picks the oldest **owned** org first; `attachCompanyId`
   (admin create) picks **any** membership org. An owner who is also a member elsewhere can get an
   admin subscription attached to a company the reader never looks at.
9. Admin create always inserts a new row instead of changing the company's existing one → multiple rows per company.

## J. Proposed migration (implemented in this change unless marked *follow-up*)

1. **One access result.** `GET /api/subscriptions/current` returns an `entitlement` block
   (`plan`, `planName`, `status`, `accessGranted`, `trial`, `features`, `limits`, `tierRank`) built by
   the same `resolveEntitlement` logic the server gates use. `useEntitlementAccess` becomes the only
   client source; it no longer reads `profiles.plan` at all.
2. **All plan displays** (sidebar badge, plan page CURRENT/Upgrade/Downgrade, billing page, banner,
   expired lock, PayRun/POS/MyPayroll gates, item-permission limits) read `useEntitlementAccess`.
3. **Required-plan labels** derive from `requiredTierForFeature` (shared), not a hand-written table.
4. **Mirror trigger** mirrors the company's *access row* (same ranking as `pickAccessSubscriptionRow`)
   to **every member's** profile, and ignores pending/processing rows.
5. **Trials use the selected package**: `start_owner_system_trial(user, company, plan_family)`;
   `handle_new_user` passes the signup `plan` (Starter/Business/Growth only; anything else → Starter).
6. **Admin plan changes** from the Users page go through a new server action
   `POST /api/admin/subscriptions {action:"set_company_plan"}` that changes the company's canonical
   subscription row (or creates one), audits it, and lets the trigger refresh profiles. The profile-only
   admin writes are removed/blocked for plan fields.
7. **Seat limit** enforced inside `handleCompanyTeamInvite` (both runtimes), counting members with a
   login + pending invites, using `FAMILY_LIMITS`.
8. **Cache**: plan changes invalidate `subscription-current` + profile queries; entitlement refetches on focus.
9. **Reconciliation**: read-only report SQL first; a separate, explicit apply script re-mirrors profiles
   from the canonical subscription. Nothing runs automatically.
10. *Follow-up (not in this change)*: DB-level plan enforcement for PostgREST writes to Business/Growth
    tables (inventory, expenses, purchase orders, recurring invoices) via a `company_has_feature()`
    RLS helper, and flipping `PAIDLY_ENTITLEMENTS_ENFORCE=true` on production after the reconciliation
    report is clean. Both can lock out paying customers if data is inconsistent, so they go after step 9.

## K. Files to modify

Server: `server/src/billing/subscriptionApi.js`, `server/src/billing/entitlements.js`,
`server/src/billing/adminBillingApi.js`, `server/src/companyTeamRoutes.js`, `api/company/[[...path]].js`,
`server/src/index.js` (admin user plan routes).
Client: `src/hooks/useEntitlementAccess.js`, `src/lib/clientEntitlement.js`, `src/pages/Layout.jsx`,
`src/components/subscription/SubscriptionSettings.jsx`, `src/pages/BillingAndInvoices.jsx`,
`src/components/subscription/FeatureGate.jsx`, `src/pages/PayRun.jsx`, `src/pages/MyPayroll.jsx`,
`src/pages/POS.jsx`, `src/components/users/UserFormDialog.jsx`, `src/pages/UsersPage.jsx`,
`src/api/userManagement.js`, `src/api/paidlyDataClient.js`.
Tests: `tests/unit/planEntitlementMatrix.test.js` (new).

## L. Database migrations

`supabase/migrations/20260921140000_canonical_plan_entitlements.sql`:
`start_owner_system_trial(uuid, uuid, text)`, `handle_new_user` (passes selected plan),
`sync_profile_from_subscription_row` (access-row + all members + skip pending),
`resolve_company_access_subscription(uuid)` helper.
`supabase/scripts/plan_reconciliation_report.sql` (read-only) and
`supabase/scripts/plan_reconciliation_apply.sql` (explicit, transactional).

## M. Risks

- **Accounts that only had a profile plan lose paid UI** once the UI reads the subscription. That is
  the correct outcome, but paying/comped customers set up via the Users page would see "No subscription".
  Run the report first and give those companies an admin subscription before deploying the client change.
- Trial package change affects only new signups; existing trials are untouched.
- The mirror now writes every member's profile on subscription change — one extra UPDATE per member.
- Seat counting changes from "all memberships" to "members with a login + pending invites"; Business
  companies that were wrongly blocked will be able to invite.
- Server enforcement on production stays report-only until `PAIDLY_ENTITLEMENTS_ENFORCE=true` is set.

---

## Implementation status (this change)

| Acceptance criterion | Status |
|---|---|
| One canonical package catalog | `shared/plans.js` + `shared/planFeatures.js`. Removed dead duplicates: `PlanManagementService`, `SubscriptionService`, `subscriptionUtils`, `subscriptionManagementUtils`, `PlanSelector`, `SubscriptionActivityRecorder`; `planLimits` no longer reads the localStorage plan override; `FeatureGate` tier table derives from `requiredTierForFeature`. |
| Subscription is the billing SoR; profiles.plan cannot authorize | Server already did; client now does too (`useEntitlementAccess` has no profile input). |
| Company subscription → members inherit | Server resolver is company-scoped; DB mirror writes every member. |
| Trial = selected package | `start_owner_system_trial(user, company, plan)`; `handle_new_user` passes signup `plan`. |
| Admin changes update the subscription | `POST /api/admin/subscriptions {action:"set_company_plan"}`; Users page (single + bulk) uses it; profile-only plan writes rejected. Audited in `audit_logs` + `subscription_events`. |
| Sidebar / badge / plan page / billing page / banner / expired lock agree | All read `useEntitlementAccess` → `entitlement` block from `/api/subscriptions/current`. |
| CURRENT / Upgrade / Downgrade from real state | `SubscriptionSettings` ranks tiers against the subscribed family; no CURRENT without access. |
| Limits from canonical entitlements | Seat check in `handleCompanyTeamInvite` (both runtimes) from `FAMILY_LIMITS`; logins + pending invites only. |
| PayFast unchanged | Checkout/ITN/plan-change code untouched; amounts still come from `public.plans`. |
| Cache invalidation | `subscription-current` refetches on focus, after PayFast return, after plan switch, after admin change. |
| Reconciliation | `supabase/scripts/plan_reconciliation_report.sql` (read-only) → `plan_reconciliation_apply.sql` (transactional, commit by hand). |
| Tests | `tests/unit/planEntitlementMatrix.test.js` (40), `tests/unit/planEntitlements.db.test.js` (9, real Postgres via PGlite). |

Also fixed while here: `canEditLineItemRate` used legacy plan keys (free/basic/pro), so every
Starter/Business/Growth company got "does not allow rate adjustments" when editing a catalog line-item
price. No package defines a rate limit, so only the item price lock applies now.

### Still open (deliberately not in this change)

1. **PostgREST writes are not plan-enforced in the database.** Inventory, expenses, purchase orders,
   recurring invoices are written straight to Supabase; only the client blocks them. Proposal: a
   `company_has_feature(org_id, feature)` SQL helper built on `company_access_subscription`, added to the
   INSERT/UPDATE RLS policies of those tables. Do this after reconciliation, or paying customers whose
   data is inconsistent get locked out.
2. **`PAIDLY_ENTITLEMENTS_ENFORCE` is unset on production** → `requireFeature` / `requireActiveBilling`
   (POS, POS integrations, team-invite billing) only log. Set it to `true` after the report is clean.
   (`assertUserHasFeature` for payroll/email and the seat limit always enforce.)
3. **Shareable company invite links** add members through the accept RPC without a seat check.
4. Admin dashboards (`AccountsManagementService`, Dashboard admin stats, `adminPlatformUsersList`)
   still report plan counts from `profiles` — reporting only, accurate once the mirror is reconciled.

### Rollout order

1. Apply migration `20260921140000_canonical_plan_entitlements.sql`.
2. Run `plan_reconciliation_report.sql`. For every "profile says paid package but company has NO
   subscription" row, decide: grant it with the Users page (now creates a real subscription) or leave it.
3. Run `plan_reconciliation_apply.sql`, review, `COMMIT`.
4. Deploy the app.
5. Then the follow-ups above.
