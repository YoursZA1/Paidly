# Paidly Plan & Entitlement Architecture

> **Plan** decides *what* a company may use. **Access status** (trial / paid / admin activation / expiry)
> decides *whether* it currently has its plan. **RBAC** decides what each user may do inside it. All three
> must pass.

## 1. Where things live

| Concept | Source of truth | Read by |
|---|---|---|
| Plan (package) | company `subscriptions` row: `plan_slug` → `plan_family` (cached family) → `plan` / `current_plan` | `resolveEntitlement` (server), `company_access_subscription` / `paidly_company_plan` (SQL) |
| Access status | same row: `status`, `trial_ends_at`, `grace_ends_at`, `current_period_end` | `hasSubscriptionAccess` (`shared/subscriptionAccess.js`), `subscription_row_has_access` (SQL) |
| Admin activation | same row: `admin_override`, `subscription_source = 'admin'`; timed = `trialing` + `trial_ends_at`, indefinite = `active` | same |
| Features + limits | **`shared/planFeatures.js`** (`FAMILY_FEATURES`, `FAMILY_LIMITS`) | everything below |
| Company | owned organization, else membership (`resolveUserCompanyId`, `paidly_user_company_id`) | resolver |
| `profiles.plan`, `subscription_status`, `is_pro` | **display mirror only** (DB trigger). Never used for access. | badges, admin fallback labels |

"Trial" is a status, never a plan. `trial` / `free` / `none` resolve to *no package*, never Starter.
Expiry removes access; the plan stays (an expired Business trial is "Business — trial expired").

## 2. Matrix

| Feature key | Starter | Business | Growth |
|---|:-:|:-:|:-:|
| `invoices`, `quotes`, `clients`, `documents_pdf` (incl. the service catalog on Products) | ✓ | ✓ | ✓ |
| `reports_basic`, `basic_reports`, `email`, `email_send`, `support_basic` | ✓ | ✓ | ✓ |
| `payslips` (standalone Payslips page, employee self-service) | ✓ | ✓ | ✓ |
| `templates` (quote templates), `inventory` (stock-tracked products, stock moves, deliveries), `recurring_invoices`, `pos` | — | ✓ | ✓ |
| `expenses`, `purchase_orders`, `vat_reports` (Accounting), `email_templates` (Settings → Email Templates) | — | ✓ | ✓ |
| `payroll` (pay runs, PAYE/UIF, Workforce reports), `leave_management` | — | ✓ | ✓ |
| `support_priority` | — | ✓ | ✓ |
| `departments` (Workforce → Organisation), `approval_workflows`, `reports_advanced`, `api_access`, `integrations`, `multi_company` | — | — | ✓ |
| Employees directory, People calendar, Attendance (placeholder) | ✓ | ✓ | ✓ |

| Limit (`FAMILY_LIMITS`) | Starter | Business | Growth |
|---|:-:|:-:|:-:|
| `payslipEmployees` — distinct employees who can be issued payslips (standalone + pay runs); employees already paid are grandfathered after a downgrade, only new ones beyond the limit are refused (`checkPayslipCapacity`) | 1 | 4 | unlimited |
| `seats` — members with a login | 1 | 5 | unlimited |

Tiers are additive: Growth includes every Business and Starter feature. Enterprise-only keys
(`sso`, `white_label`, …) are contact-sales and never shown as an upgrade CTA.

## 3. Resolution flow

```
user → company (owned org, else membership)
     → company subscription rows (+ owner rows with no company_id)
     → access row (pickAccessSubscriptionRow: rows granting access first, newest wins)
     → plan family (slug first) + access (status / dates)
     → FAMILY_FEATURES[plan] / FAMILY_LIMITS[plan]   (empty when no access)
```

Server: `resolveEntitlement` → `buildEntitlementSnapshot` → `GET /api/subscriptions/current → entitlement`.
Client: `useEntitlementAccess()` (loaded once, React Query cached, refetched on focus) →
`hasFeature(key)`, `entitlement.limits`.

## 4. Enforcement points

| Layer | How |
|---|---|
| Server API | `requireFeature(req, res, key)` / `assertUserHasFeature(...)` (POS, payroll, leave, email, integrations); `assertPayrollEmployeeCapacity` (pay runs); `checkCompanyInviteSeat` (seats) |
| Database (browser-written data) | `paidly_assert_plan_feature`: BEFORE INSERT on services (products → inventory, else invoices), products, stock_transactions, purchase_orders(+items), suppliers, expenses, recurring_invoices, payslips (+ grandfathered employee limit); `adjust_inventory_stock` (inventory); `organizations.email_templates` (email_templates). Mirrors the catalog; the matrix tests fail on drift |
| Company email templates | `GET/PUT /api/company/email-templates` (`requireFeature`-equivalent + `manage_company_settings`) |
| Routes | `planGate(feature, <Page />)` in `src/pages/index.jsx`, or `<FeatureGate feature>` inside the page |
| Nav | `feature:` on nav items (Layout, `workforceNav.js`) → locked item with a package-relative upgrade label |
| Actions | `useEntitlementAccess().hasFeature(key)` before opening a form; browser write gate in `EntityManager` |
| Upgrade copy | `resolveUpgradeTarget` (`shared/planUpgrade.js`): renew current plan if it has the feature, else next plan up; Growth never gets a CTA |

Enforcement is **on by default** in the server and the database. Emergency log-only rollback — switch both:
`PAIDLY_ENTITLEMENTS_ENFORCE=false` (server) and `ALTER ROLE authenticated SET app.paidly_entitlements_enforce = 'off'` (database).

## 5. Lifecycles

- **Signup:** the chosen package (`?plan=` from pricing, or the picker) → user metadata → `handle_new_user` →
  `start_owner_system_trial(plan)` → `trialing` row on that package.
- **Trial:** full plan entitlements until `trial_ends_at`.
- **PayFast payment:** ITN writes `plan_slug` + `plan_family` on the company row → `active`.
- **Admin:** `set_company_plan` / `start_trial` / `activate_indefinite` rewrite all package columns on the
  row the resolver reads. The DB trigger mirrors it into every member's profile; `ProfileRealtimeBridge`
  re-reads `/subscriptions/current` on that realtime event, so logged-in users see it within seconds.
- **Expiry:** status changes, package does not; renewing restores the same plan's features.

## 6. Adding a feature

1. Add the key to the lowest package in `shared/planFeatures.js` (and to `paidly_feature_min_tier` if a
   browser-written table needs a DB guard — the parity test will tell you).
2. Server: `requireFeature` / `assertUserHasFeature` on its routes.
3. UI: `feature:` on its nav item, `planGate` on its route, `hasFeature` before create actions.
4. Pricing copy: `shared/planMarketing.js`.
5. Add a row to the matrix test.

Never branch on `plan === '…'`, `profiles.plan`, or trial status for access.
