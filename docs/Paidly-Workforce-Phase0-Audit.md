# Paidly — Workforce Core Phase 0 Audit

**Date:** 12 Sep 2026  
**Status:** Complete — audit only. No tables dropped. No production data changed. No payroll rewrite.  
**Rule:** Do not attempt the entire refactor in one pass.

This report is the Phase 0 exit artifact. Later phases must close **gaps only**. Most of the Workforce Core already exists.

---

## Verdict

Paidly already has **one Workforce Core**, not three disconnected products.

- Employee identity is `memberships.id`. There is **no** `employees` table.
- Leave has a real ledger (`leave_requests` / `leave_balances` / `leave_transactions`).
- Payroll math is one pure function: `shared/payroll/calculatePayroll.js`.
- Pay runs calculate, approve, finalize, and issue locked payslips.
- `/api/payroll/*` and `/api/leave/*` rewrite onto `api/company`. No 13th Vercel function.
- Payslip email is a token link, not an attached payroll PDF.
- Payroll is **not** on the Payment Engine (correct).

The remaining work is **hardening and deprecation**, not a greenfield rebuild.

```
IMPLEMENTED (do not rebuild)          STILL OPEN (phase work)
────────────────────────────          ──────────────────────
memberships.id identity               dual leave keys (profile + employee_id)
provisionEmployeeWorkforce()          payslips.employee_id text vs UUID mix
leave ledger + tokens                 hub leave_request still editable
calculatePayroll()                    CSV payslips without membership_id
pay-run lifecycle                     preview fallback with empty statutory rules
finalize → locked payslips            public payslip UUID-only when never emailed
unpaid leave → UNPAID earning         manager /Payslips shows net_pay
Employee Profile + MyPayroll          hub leftover cleanup (Phase 12)
Hobby rewrites onto api/company       Phase 13 E2E scenario + Phase 14 release
```

---

## MATCHES ARCHITECTURE

| Area | Status | Evidence |
|---|---|---|
| No parallel `employees` table | Match | Zero `CREATE TABLE employees` in `supabase/` |
| Canonical employee = `memberships.id` | Match | Workforce migrations + `shared/workforce/employeeIdentity.js` |
| Printed number stays `employee_id` text on payslips | Match | `payslips.employee_id` is text; UUID is `payslips.membership_id` |
| Payroll tables | Match | `payroll_profiles`, `pay_runs`, `pay_run_items`, `payroll_statutory_rules`, `payroll_component_types` |
| Leave tables | Match | `leave_types`, `leave_balances`, `leave_requests`, `leave_transactions`, `leave_approval_tokens` |
| Provisioning | Match | `provisionEmployeeWorkforce()` creates profile, balances, attendance, prefs; idempotent |
| Invite link | Match | `company_invites.membership_id` → pre-created membership |
| Payroll math | Match | Only `calculatePayroll.js` (callers: `payrollService.js`, `PayeTaxCalculator.jsx`, tests) |
| Unpaid leave impact | Match | `unpaidLeaveImpact.js` → negative `UNPAID` earning |
| Statutory rules | Match | Versioned `payroll_statutory_rules`; React has no PAYE/UIF tables |
| Pay-run lifecycle | Match | draft → processing → calculated → awaiting_approval → approved → finalize → paid |
| Snapshots | Match | `pay_run_items` stores `base_salary_snapshot` + unpaid-leave impact |
| Approval SoD | Match | Different payroll admin required when more than one exists |
| Payslip issuance | Match | `finalizePayRun()` copies item, `locked: true`, links `payslip_id` |
| Document Engine delivery | Match | `PayslipDocument` / `document-engine/pdf/payslip.jsx`; events on specialised table |
| Email | Match | Token link via `sendPayslipEmail`; comment: never attach payroll PDF |
| Public leave | Match | Hashed single-use tokens on `api/public-share` |
| Payment isolation | Match | No `payment_intents` / Ozow / PayFast in payroll or leave |
| Hobby functions | Match | Rewrites onto existing `api/company` and `api/public-share` |
| Employee Profile | Match | `/employees/:id` aggregates leave, payroll, payslips; compensation redacted unless `manage_payroll` |
| Self-service | Match | `MyPayroll`, `ManagerPortal`, `/Leave`, `/Payroll` |

---

## VIOLATIONS

These are the items later phases must fix. None require a new employee table or a second payroll engine.

| ID | Severity | Phase | Violation |
|---|---|---|---|
| V1 | High | 1 | `canonicalEmployeeId()` prefers `row.employee_id` before `membership_id`. On a **payslip** row, `employee_id` is a printed number — or a leftover UUID string. Passing a payslip into this helper can mis-resolve identity. |
| V2 | High | 1 / 7 | Payslip CSV import (`src/utils/payslipCsvMapping.js`) writes `employee_id` as free text and **never** sets `membership_id`. |
| V3 | High | 7 / 8 | Public payslip: if `sent_to_email` is empty, `handlePublicPayslipGet` returns the **full** payslip JSON from token alone (`api/_publicPayslipShared.js`). |
| V4 | Medium | 4 / 7 | `useServerPayrollPreview` falls back to `calculateFullPayroll(..., [])` — same formula, **zero statutory rules** — so standalone compose can persist wrong PAYE/UIF. |
| V5 | Medium | 3 / 12 | Documents Hub `leave_request` is still editable/approvable in `DocumentDetail.jsx` and does **not** call `/api/leave`. Uses fictional `DEFAULT_LEAVE_BALANCES`. |
| V6 | Medium | 5 / 7 | Standalone `CreatePayslip` / `EditPayslip` / CSV still write `payslips` without a pay-run snapshot. Blueprint allows drafts; UI still promotes this as a normal path. |
| V7 | Medium | 11 | `/Payslips` (“Team Payroll Summary”) always shows `net_pay`. Managers without `manage_payroll` can see compensation in the list UI. |
| V8 | Medium | 1 / 11 | `EmployeeProfile` route is gated only by `VIEW_OWN_PROFILE`. API enforces scope; frontend guard does not. `ViewPayslip` is RequireAuth only. |
| V9 | Low | 1 | Leave ledger dual-keys: `payroll_profile_id` **and** `employee_id` (membership UUID). Drift is possible if a profile is recreated. |
| V10 | Low | 1 | `leave_transactions.employee_id` is still nullable. |
| V11 | Low | 1 | `supabase/schema.postgres.sql` does not include workforce tables (migrations do). Fresh schema-only installs would miss the engine. |
| V12 | Low | 5 | Service retries drop `membership_id` / snapshot columns on “missing column” errors — can hide incomplete migrations. |
| V13 | Info | 9 | Unpaid leave approved after finalize correctly flags `needs_adjustment_run`. Confirm UI surfaces this (do not rewrite the finalized run). |

**Not violations**

- `calculatePayroll` does not query the database or use `Date.now()`.
- `PayeTaxCalculator.calculatePAYE()` / `calculateUIF()` are deprecated stubs that return zeros.
- `markPayRunPaid` is a disbursement flag on `pay_runs` / `payslips`, not Payment Engine settlement.

---

## DUPLICATE SYSTEMS

| Duplicate | Canonical | Legacy / secondary | Action |
|---|---|---|---|
| Employee identity | `memberships.id` | None (no `employees` table) | Keep. Do not add a second table. |
| Leave | `/api/leave` ledger | Hub `documents.type = leave_request` | Stop new writes; leftover cleanup in Phase 12 |
| Payslip issue | Pay-run `finalizePayRun` | Standalone compose + CSV import | Restrict to out-of-band drafts; require `membership_id` |
| Payroll preview | `/api/payroll/preview` + DB rules | Client fallback with `statutoryRules: []` | Fail closed or show “preview unavailable” |
| Day count | `shared/leave/leaveMath.countWorkingDays` | Hub `countBusinessLeaveDays` | Hub path deprecated |
| Manager UI | `ManagerPortal` + `/Leave` | Same `leaveApi` (OK overlap) | Keep; hide Portal when user has `MANAGE_LEAVE` (already) |

---

## DATABASE CHANGES REQUIRED

**Phase 0–14 must not:** drop tables, rewrite historical payslips, or introduce `public.employees`.

| Change | Phase | Destructive? | Notes |
|---|---|---|---|
| Prefer `membership_id` in app identity helpers | 1 | No | Code only |
| Require `membership_id` on new payslip writes | 1 / 7 | No | Code + optional CHECK already exists for pay-run items |
| Backfill `payslips.membership_id` where number matches | 1 | No | Additive UPDATE only; do not clear printed `employee_id` |
| Optionally NOT NULL `leave_transactions.employee_id` | 1 | No | Only after counting remaining nulls; `NOT VALID` then validate |
| Do **not** drop hub `leave_request` rows | 12 | — | Mark deprecated; stop writes |
| Do **not** delete historical standalone payslips | 12 | — | Stop new unlocked writes when a run covers the period |
| Sync `schema.postgres.sql` with migrations | 14 | No | Documentation / fresh-install fidelity |

Existing migrations already cover the core schema (`20260902120000` … `20260910150000`). New migrations are **tighten-only**, never replace.

---

## FRONTEND CHANGES REQUIRED

| Change | Phase |
|---|---|
| Keep `EmployeeSelect` as the only employee picker (`value` = membership UUID) | 1 |
| CSV import must resolve `membership_id`; reject rows that cannot | 1 / 7 |
| Do not put display labels or `EMP-*` into UUID fields | 1 |
| Fail closed when payroll preview API fails (no empty-rules fallback) | 4 |
| Redirect / read-only leftover hub `leave_request` | 3 / 12 |
| Demote standalone payslip compose to “out-of-band draft” | 7 |
| Redact `net_pay` on `/Payslips` unless `manage_payroll` or own row | 11 |
| Tighten route guards: Employee Profile (self or team), ViewPayslip (own or manage) | 11 |
| Surface `needs_adjustment_run` after late unpaid-leave approval | 9 |
| Attendance tab remains a stub until a later product pass | 10 (no new identity) |

---

## BACKEND CHANGES REQUIRED

| Change | Phase |
|---|---|
| `canonicalEmployeeId`: never treat payslip `employee_id` text as the employee UUID | 1 |
| Payslip insert must attach `membership_id`; do not silently drop it | 1 / 7 |
| Public payslip: always email-gate (or refuse full payload when `sent_to_email` is missing) | 8 |
| Preview endpoint remains the only statutory source for compose | 4 |
| Hub leave approve must not become a second leave API | 3 / 12 |
| Keep Hobby rewrites; do not add `api/payroll.js` or `api/leave.js` | all |
| Do not route payroll through Payment Engine | all |

---

## PRODUCTION DATA RISKS

| Risk | Impact | Mitigation |
|---|---|---|
| Historical `payslips.employee_id` may contain a UUID string | `canonicalEmployeeId(payslip)` can pick the wrong field | Prefer `membership_id`; never UPDATE printed numbers to UUIDs |
| Payslips without `membership_id` (CSV / old compose) | Self-service and RLS may miss rows | Additive backfill by employee number; keep text number |
| Dual leave uniqueness (`payroll_profile_id` and `employee_id`) | Duplicate balances if profile recreated | Provisioning stays idempotent; do not recreate profiles |
| Nullable `leave_transactions.employee_id` | Ledger rows without employee | Backfill then constrain; do not delete |
| Token-only public payslip | Anyone with the UUID sees full pay | Require email verify or authenticated session |
| Client-authored standalone amounts | Wrong PAYE stored on draft payslips | Server preview required; fallback must not persist statutory zeros |
| Schema-softening retries | Incomplete migrations look “working” | Fail loud when `membership_id` / snapshot columns missing |
| Hub leftover leave documents | Two approval stories | Read-only leftover UX; ledger is source of truth |
| `schema.postgres.sql` lag | Fresh DB missing workforce tables | Apply migrations; later refresh schema dump |

---

## Search coverage

Repository search for the required terms (`employees`, `employee_id`, `membership_id`, `payroll`, `payslip`, `leave`, `calculatePayroll`, `documents`, `payment`):

| Term | Finding |
|---|---|
| `employees` | UI/API name only. No identity table. |
| `employee_id` | UUID → `memberships.id` on leave/workforce tables. **Text printed number** on `payslips`. |
| `membership_id` | Canonical UUID on payslips, pay-run items, invites, documents. |
| `payroll` | One engine under `shared/payroll` + `server/src/payroll`. |
| `payslip` | Specialised table + Document Engine delivery. Hub type exists as leftover catalog entry. |
| `leave` | Ledger is canonical; hub `leave_request` is leftover. |
| `calculatePayroll` | Three callers only (service, UI wrapper, unit tests). |
| `documents` | Must not receive invoice/quote/payslip dual-writes. Hub still hosts leftover leave_request. |
| `payment` | Invoice/POS Payment Engine only. Payroll `paid` is a status flag. |

---

## Phase status (do not skip ahead)

| Phase | Objective | Status | Remaining |
|---|---|---|---|
| **0** | Audit & safety | **Done (this document)** | — |
| **1** | Employee identity | Partial | V1, V2, V9, V10 — helpers + write guards. No new table. |
| **2** | Provisioning | Done | Verify idempotency tests only |
| **3** | Leave ledger | Partial | Ledger works; retire hub write path |
| **4** | Payroll engine | Partial | Remove empty-rules preview fallback |
| **5** | Pay runs | Done | Snapshot fail-loud (V12) |
| **6** | Approval | Done | Keep SoD; no extra engine |
| **7** | Payslip issuance | Partial | Require membership on all writes; demote compose |
| **8** | Document delivery | Partial | Always email-gate public payslip |
| **9** | Leave ↔ payroll | Done | Surface adjustment-run flag in UI |
| **10** | Employee profile | Partial | Attendance stub OK; do not duplicate data |
| **11** | Self-service / RBAC | Partial | Route guards + payslip list redaction |
| **12** | Cleanup | Not started | Deprecate leftovers; do not delete history |
| **13** | Full QA | Not started | EMP-002 / R20,000 / 2 of 22 days scenario |
| **14** | Production readiness | Not started | Migrations, RBAC, Blue/Green |

---

## Implementation order (unchanged)

```
PHASE 0 Audit          ← you are here
   ↓
PHASE 1 Identity       ← next: close V1/V2 only
   ↓
PHASE 2 Provisioning   (verify, do not rewrite)
   ↓
PHASE 3 Leave ledger   (stop hub writes)
   ↓
PHASE 4 Payroll engine (fail-closed preview)
   ↓
PHASE 5–6 Pay runs / approval (verify)
   ↓
PHASE 7–8 Payslips + delivery
   ↓
PHASE 9 Leave ↔ payroll (UI flag)
   ↓
PHASE 10–11 Profile + RBAC
   ↓
PHASE 12 Cleanup
   ↓
PHASE 13 QA
   ↓
PHASE 14 Release
```

## Final rule

Do not skip ahead because a later feature looks easier.

```
Employee Identity → Leave Ledger → Payroll Engine → Pay Run → Payslip → Self-Service
```

The objective is **one reliable Workforce Core**, not visually connecting three pages.
