---
pdf_options:
  format: A4
  margin: 18mm
  printBackground: true
---

# Paidly — Product Architecture Strategy & Blueprint

**Purpose:** Shift from a *page list* mental model to **systems** and a defined **core engine**, while keeping the technical map honest.

---

## Paidly Architecture v2 (clean reference)

*One-page upgrade summary. This section is the canonical **Paidly v2 system map** used across product and engineering.*

**Paidly v2 Systems (final):**

1. **Identity System** — Auth, users, organizations, roles, RLS-backed tenancy.
2. **Document Engine** — Invoices, quotes, payslips unified as `document(type=…)`; shared compose, send, and PDF paths.
3. **Payment Intent Layer** — Canonical handoff from document delivery/observation to payment rails and settlement orchestration.
4. **Revenue System** — Payment providers, subscriptions, cash flow, and reporting (reads/rails downstream of documents).
5. **Relationship System** — Clients + catalog + offering intelligence that feeds document composition.
6. **Experience System** — Shared UI/interaction contracts (shell, sticky actions, money UX consistency).
7. **Payment Intelligence Layer** — Get Paid logic: reminders, nudges, triggers, and follow-up intelligence.

**Frontend layout system** (consistent everywhere):

- **Header** — title + primary **actions**
- **Content** — tables, grids, main **forms**
- **Side panel** — **summary**, filters, secondary controls (`PageTemplate` in code)

**Data flow (client):**

```
UI → Hooks → Services → Entity facades (EntityManager) → Supabase
```

**Serverless APIs (`/api/*`)** handle:

- Payments (**Payfast**)
- Emails (**Resend** / SMTP)
- Public document access (shares, tokens)
- **Cron** jobs (dunning, reminders, ops)

**Goal:** Evolve Paidly from an **invoicing tool** into a full **business operating system**—same story as **Positioning** below.

---

## Positioning — real product advantage

**Paidly is not an invoicing app.** It is a **business operating system** for SMBs: one place to **issue** commercial documents, **run** client and catalog relationships, **see** money and performance, and **grow** through channels like affiliates—without treating each area as a separate product bolted together in the UI only.

**Investor-facing framing:** shift the story from “invoice app” to **financial workflow platform for SMEs**.

**You already have (in shipped or advanced form):** invoices, quotes, payslips (unified as **documents**), clients, reporting, affiliates, and the plumbing for payments, subscriptions, and cash visibility.

**Competitive edge:** most tools **excel at one slice** (invoicing-only, or accounting-only, or a disconnected referral program). **Few competitors unify** issuance (document engine), relationship/catalog input, revenue/ops read models, and payment intelligence **under one coherent architecture** and vocabulary. That unification—**Document → Payment Intent → Revenue System** plus shared **Experience** and **Payment Intelligence**—is the defensible story: not “another invoice PDF,” but **operating the business** in one system.

**Execution reality:** roughly 70% of the SaaS architecture is already in place. The remaining value-defining 30% is: payment abstraction, event tracking, and experience consistency.

---

## Executive framing

| Old lens | New lens |
|----------|----------|
| “Invoicing app” / feature checklist | **Business operating system** — documents + relationships + money + growth |
| “We have Invoices, Quotes, Payslips…” | **One Document Engine** with multiple **document kinds** |
| “Invoices page, Quotes page, Clients page…” | **Create Document** → configure **type** (invoice / quote / payslip) → **same UI shell** → **different logic** per kind |
| Features as separate products | **Five core systems** + one **Experience system** (cross-cutting) |
| Routes drive architecture | **Capabilities** drive architecture; routes are just entry points |

**Brutal truth the strategy fixes:** the stack was described accurately but not **product-driven**: no named “engine,” no explicit system boundaries, and no place for **scaled UX consistency** beyond ad hoc pages.

---

# Part A — Product architecture (systems)

## A.1 Paidly v2 systems (final architecture)

These are the **real** architecture—not the sidebar.

### 1. Identity System

**Job:** Who is acting, for which organisation, with what authority.

- Supabase Auth (sessions, JWT)
- `profiles`, `organizations`, `memberships`, roles (`admin`, `management`, …)
- RLS as the enforcement layer; client as the UX layer

**Strategy:** **Stabilise, don’t expand.** Harden session edge cases, org bootstrap, and role gates (`RequireAuth`) so every other system trusts Identity cheaply.

**Auth + session stabilization (in flight):** one coherent story for **session read/write** (`getSession` vs `getUser` races, refresh in parallel tabs, AbortError handling), **profile restore** when local auth cache is cleared, **invite / password / org bootstrap** flows, and **no silent “logged in but empty user”** states. Client work touches **`customClient.js`** / `AuthManager`, **`RequireAuth`**, and Supabase Auth config—treat this as **foundation** before shipping net-new document features at scale.

---

### 2. Document Engine (the commerce core)

**Job:** Everything a business **issues to another party** to record obligation, intent, or compensation—then **delivers**, **tracks**, and often **collects** on.

**Canonical product vocabulary** (feature → model):

| Feature (legacy naming) | Becomes |
|---------------------------|---------|
| Invoice | `document(type="invoice")` |
| Quote | `document(type="quote")` |
| Payslip | `document(type="payslip")` |

**Persistence (today):** still separate Supabase tables (`invoices`, `quotes`, `payslips` / payslip stack)—the **unification is logical and in code** first (`src/document-engine/`), not a forced single-table migration.

**Migration status (implementation):**

- **Unified now (code-level contracts):**
  - Shared document type vocabulary and routing helpers in `src/document-engine/`.
  - Shared list-controller and adapter pattern for invoice/quote/payslip list screens.
  - Shared pagination and shared export assembly service paths.
- **Partially unified (same behavior, separate persistence):**
  - Compose/send/render flows increasingly share helpers/services, but write into legacy per-type tables.
- **Not unified yet (roadmap):**
  - Single persistence model for all document kinds.
  - Full payment-intent/event model as canonical settlement source.

**Reframe:** not “invoices vs quotes vs payslips” but **one engine**:

| Document kind | Today’s surface | Same engine primitives |
|---------------|-----------------|---------------------------|
| **Invoice** | Invoices, recurring | Draft → send → view/track → pay / remind |
| **Quote** | Quotes, templates | Draft → send → accept/expire → convert |
| **Payslip** | Payslips | Draft → send → employee view |

**Shared lifecycle (conceptual):**

`Author` → `Compose` (lines, tax, branding) → `Render` (PDF/HTML) → `Deliver` (email, link, portal) → `Observe` (opens, reminders, delivery/engagement telemetry) → `Payment Intent` (amount/currency/expiry + rail handoff) → `Settle` (payment, acceptance, archive)

#### Observe layer (formalized)

`Observe` is not a loose log. It is a first-class event layer that records delivery, engagement, and money-adjacent milestones in a single stream per document.

**Schema upgrade (`document_events`):**

- `id`
- `document_id`
- `event_type` (`sent` | `opened` | `clicked` | `paid` | `reminded`)
- `occurred_at`
- `actor_type` (system | recipient | user | webhook)
- `metadata` (jsonb for channel, provider payload refs, reminder run id, etc.)

**Event taxonomy (minimum canonical set):**

- `sent`
- `opened`
- `clicked`
- `paid`
- `reminded`

**This powers:**

- Timeline (client and document history)
- Notifications (state-aware in-app/email nudges)
- Smart reminders (behavior + due-date + payment-intent aware)
- Analytics (delivery-to-payment funnel and conversion diagnostics)

**Why this matters for product:**

- One **mental model** for PM, design, and eng.
- One place to invest: **send pipeline**, **PDF pipeline**, **public token model**, **status vocabulary**, **line-item model**.
- One observable event stream (`document_events`) that unifies communication and payment lifecycle telemetry.
- Feature parity (e.g. quote send = invoice send) becomes **engine work**, not three copies.

**Technical anchor today:** `Invoice` / `Quote` / `Payslip` entities + `InvoiceSendService`-style orchestration + `/api/send-email` + public share routes. **In code:** `src/document-engine/` exports `DOCUMENT_TYPES`, `normalizeDocumentType`, `parseRouteDocumentTypeStrict`, `getDocumentEntity`, `documentRef`—use these for routing, analytics, and new engine code. **Roadmap:** grow this module (shared send/PDF adapters, shared status vocabulary) so new document kinds plug in, not fork.

#### Critical addition: Payment Intent layer (Document Engine ↔ Revenue & Ops)

Without a first-class `Payment Intent`, payments feel bolted on, Payfast-specific logic leaks across product surfaces, and the engine is harder to scale. Introduce a canonical handoff object between document delivery/observation and financial capture.

**Why this matters:**

- **Without it:** payments feel bolted on, provider logic leaks everywhere, and cross-surface consistency breaks.
- **With it:** clean abstraction between document and payment rails, multi-provider readiness, and analytics-ready payment funneling.

**Payment intent contract (per payable document):**

- `intent_id` (idempotent)
- `document_ref` (`type`, `id`, `org_id`)
- `amount_snapshot` + `currency_snapshot`
- `payer_context` (public share, portal user, or signed-in actor)
- `rail` (`payfast`, future rails), `expires_at`
- `status` (`pending`, `requires_action`, `paid`, `failed`, `cancelled`, `expired`, `refunded`)

**Schema upgrade (`payment_intents`):**

- `id`
- `document_id`
- `provider` (`payfast` | `stripe`)
- `amount`
- `currency`
- `status`
- `external_id`
- `created_at`

**Boundary of ownership:**

- **Document Engine owns:** payable snapshot creation, due/expiry semantics, and `document_ref` identity.
- **Revenue & Ops owns:** provider orchestration, webhook verification, settlement/reconciliation, and ledger-like payment records.
- **Experience System owns:** one payment-status language and CTA behavior across document detail, public links, and portal views.

**Result:** no direct “mark paid” shortcuts from UI paths; all payable settlement flows through `Payment Intent` + verified payment events.

#### Product upgrade: one compose surface, many kinds

The **big upgrade** is not more list pages—it is **one mental journey**:

1. **Create Document** (single entry pattern: compose, brand, line items).
2. **Configure type** — `invoice` / `quote` / `payslip` (and future kinds)—as a **property of the document**, not a separate app area.
3. **Same UI** — shared shell, editors, preview, send affordances (Experience System + document templates).
4. **Different logic** — status machines, tax/settlement rules, payroll vs AR: **kind-specific adapters** behind the same surface.

List routes (“Invoices”, “Quotes”) remain **indexes and filters** over `document(type=…)`; they are not where the product story starts.

---

### 5. Relationship System

**Job:** **Who** you sell to and **what** you sell—data that **feeds** the Document Engine.

- **Clients** (CRM): contact, terms, portal access
- **Catalog** (`services`): products & services, pricing, inventory where relevant
- **Line items** on documents: snapshots + links back to catalog when useful

**Strategy:** Treat this as the **input graph** to commerce—not a separate “Contacts app.” List screens are views; the system is **relationship + SKU/rate intelligence**. Growth-oriented **CRM behaviour** (follow-ups, nudges, sequences) lives primarily in the **Growth Engine**; this system owns **master data** and what gets embedded on documents.

---

### 4. Revenue System (Revenue & Ops)

**Job:** Everything that turns **issued documents** (especially invoices) into **cash, visibility, and tenant billing**—without re-implementing document authoring here.

- **Payments:** Payfast, invoice payment state, webhooks (`api/payfast-handler`)
- **Payment intents:** capture/retry/expiry orchestration and provider status normalization
- **Cash flow:** timelines and balances built from documents + payments
- **Reports:** read models and exports on top of documents + payments + catalog where relevant
- **Subscriptions & dunning:** how Paidly bills the customer (packaging, crons in `vercel.json` → `/api/cron/...`)

**Feeds off the Document Engine:** revenue truth is **downstream of document state** (totals, status, due dates, line items). Revenue & Ops aggregates, reconciles, and projects; it does not fork “another invoice.”

**Strategy:** Keep business rules that define **what a document is** (e.g. when an invoice is *overdue* in product terms) aligned with the Document Engine; keep **money rails** (capture, allocate, subscription charge) here.

**Payment integration rule:** provider events never mutate document totals directly. They update payment-intent/payment records first; document settlement status is derived via verified reconciliation rules.

#### Responsibility split (hard boundary)

**Document Engine owns:**

- Document status semantics (`paid`, `overdue`, lifecycle transitions)
- Document totals and payable snapshots

**Revenue & Ops owns:**

- Payment providers (Payfast, Stripe, future rails)
- Subscriptions and dunning/billing operations
- Cash flow models
- Reporting/read models

**Boundary outcome:** clear separation keeps document rules coherent while allowing payment/billing systems to scale independently.

### 7. Payment Intelligence Layer (Get Paid System)

**Job:** Turn events + payment intent state into proactive actions that improve collection velocity.

- Inputs: `document_events`, `payment_intents`, due dates, client/payment history
- Decisions: reminder timing, CTA sequencing, retry windows, provider fallback policy
- Outputs: auto reminders, smart nudges, “invoice viewed but not paid” triggers, suggested follow-ups, prioritized “at-risk” invoices, and payment funnel analytics

**Example trigger (v1):**

Client viewed invoice 3 times without a `paid` event in the observation window → trigger reminder and surface a suggested follow-up action in the right panel.

**Position in architecture:** sits between observation/payment state and user-facing actions, orchestrating how Paidly gets customers paid faster without leaking provider logic into page code.

---

### Growth loops (implemented within Revenue, Relationship, and Experience systems)

**Job:** How Paidly **acquires, retains, and scales**—loops that sit beside day-to-day issuing.

- **Affiliates:** acquisition + admin moderation (`api/affiliates`, …)
- **Emails:** transactional and campaign-style sends from `/api` and app-triggered flows
- **Notifications:** in-app + scheduled nudges (crons, reminders, due-date services)
- **CRM behaviour:** follow-ups, client engagement, portal nudges—**behaviour** on top of Relationship data, not a duplicate CRM product

**This is how Paidly scales:** repeatable growth mechanics without entangling them in the document compose path.

**Operator / platform admin** (users, oversight, platform messages, `/admin-v2/*`) can be documented as part of this engine or Identity, depending on audience—treat it as **platform operations**, not SMB document logic.

---

## 6. Experience System (UX at scale)

**Job:** So Paidly **feels** like one product, not twenty features stitched together.

**Pillars:**

| Pillar | Meaning |
|--------|---------|
| **Shell** | Repeated editor layout: full-width work area, `max-w-*` content, sticky summary/actions (pattern already emerging: EditQuote, EditClient, EditCatalogItem). |
| **Tokens** | `border-border`, `bg-card`, `text-muted-foreground`—no one-off palette per page. |
| **Data discipline** | React Query keys, invalidation rules, “hydrate from cache then refresh” for perceived speed. |
| **A11y & forms** | Label/`id` parity, focus order, disabled states that explain *why* (title/tooltip). |
| **Money UX contract** | Same status chips + primary CTA logic (`Pay now`, `Retry payment`, `View receipt`) everywhere a payable document appears. |
| **Page template** | List/index pages share one **three-zone** shell (below)—visual consistency reads as **premium**. |

**Strategy:** Treat “Experience” as **governed**: a short **layout + form checklist** for any new surface that touches Identity or the Document Engine—same as you’d gate API changes.

#### Experience upgrade: make the editor pattern universal

The editor shell is a product advantage only if it is consistent across **documents and money actions**. Standardize the same right-side sticky panel pattern for invoice payment actions, not just compose/edit forms.

**Universal right panel contract (sticky):**

- Primary amount block (`Total`, optional secondary currency conversion).
- Primary action first (`Pay Now` when payable).
- Secondary lifecycle actions below (`Send Reminder`, receipt/share actions by state).
- Deterministic state switching from `Payment Intent` status (no page-specific CTA ordering).

**Invoice payment panel (reference pattern):**

- `Total: $100`
- `≈ R1,638`
- `[ Pay Now ]`
- `[ Send Reminder ]`

### Page Template System (UI system — critical)

The UI is improving but must be **systemized**, not page-by-page improvisation.

**Every primary list / index page follows three zones:**

1. **Header** — page title, one-line purpose, **primary actions** (create, import, refresh, layout toggle). Prefer `PageHeader` (`src/components/dashboard/PageHeader.jsx`) inside `PageTemplate.Header`.
2. **Content** — main **table or grid** (or tabbed main). This is the scroll-heavy region; keep widths `min-w-0` so tables don’t blow the shell.
3. **Side panel** — **filters**, **counts / summary**, secondary controls. On large screens: **sticky** column (`lg:`) to the right of content; on small screens: stack **below** main or **above** the table (pick one per product area and stay consistent).

**Code:** `PageTemplate` + `PageTemplate.Header` + `PageTemplate.Body` (`sidePanel` prop) in **`src/components/layout/PageTemplate.jsx`**. Import from `@/components/layout` or `@/components/layout/PageTemplate`. Use **`embedded`** when the page already sits inside a padded shell (e.g. **`AdminLayout`**).

**Conformance targets (same chrome, same rhythm):**

| Page | Scope |
|------|--------|
| **Invoices** | Primary document list — header/actions + table; filters/summary → side panel |
| **Quotes** | Same pattern as invoices |
| **Clients** | Relationship index — header + list/grid; filters or segment summary → side |
| **Services** | Catalog / inventory — header + content; industry/templates/search → side where possible |
| **Affiliates** | Growth admin — `PageHeader` already; align body to **content + sticky side** for search/status |

Refactors can be **incremental**: introduce `PageTemplate` first, then move filters/summary into `sidePanel` per page without changing data logic.

### Standardize UI layout (everything same structure)

**Rule:** major surfaces share one **structural grammar** so the product reads as intentional, not a stack of one-off pages.

| Surface type | Structure |
|----------------|-----------|
| **List / index** (Invoices, Quotes, Clients, Services, Affiliates, …) | **`PageTemplate`**: Header (title + actions) → Content (table/grid) → Side panel (filters / summary) |
| **Document compose / edit** | Shared **editor shell**: full-width work area, `max-w-*` content, **sticky** summary + primary actions (align `EditInvoice` / `EditQuote` / `CreateDocument` patterns) |
| **Payment touchpoints** (document detail, public invoice, portal) | Shared payment state model driven by `Payment Intent` status; same CTA order and error/retry messaging |
| **Admin / settings-style** | **`PageHeader`** + main column; use **`PageTemplate` with `embedded`** when inside `AdminLayout` if a side rail helps |

**Deliverable:** keep the **Experience checklist** short: “Which template? Header actions? Side panel? Sticky save?”—**every new page picks a row**, no ad hoc fourth layout.

---

## A.3 System map (one picture)

```
                    ┌─────────────────────────┐
                    │   Experience System     │
                    │ (shell, tokens, a11y)     │
                    └───────────┬─────────────┘
                                │
┌───────────────┐    ┌──────────▼──────────┐    ┌────────────────────┐
│   Identity    │───►│   Document Engine    │◄───│ Relationship &     │
│   & Access    │    │ (invoice/quote/      │    │ Offering           │
└───────────────┘    │  payslip kinds)      │    └────────────────────┘
        │            └──────────┬───────────┘
        │                       │
        │                       ▼
        │            ┌───────────────────────┐
        │            │ Payment Intent Layer  │
        │            │ create · track · map  │
        │            └──────────┬────────────┘
        │                       │
        │                       ├──────────────┐
        │                       ▼              │
        │            ┌───────────────────────┐ │
        │            │ Payment Intelligence  │ │
        │            │ reminders · retry ·   │ │
        │            │ funnel actions        │ │
        │            └──────────┬────────────┘ │
        │                       │              │
        │                       └──────────────┘
        │                       │
        │                       ▼
        │            ┌───────────────────────┐
        │            │   Revenue & Ops       │
        │            │ Payfast/Stripe · subs │
        │            │ cash flow · reports   │
        │            └──────────┬────────────┘
        │                       │
        │                       ▼
        │            ┌───────────────────────┐
        │            │       Webhook         │
        │            │ verify · normalize    │
        │            └──────────┬────────────┘
        │                       │ settle signal
        │                       ▼
        │            ┌───────────────────────┐
        │            │   Document Engine     │
        │            │  status settlement    │
        │            └──────────┬────────────┘
        │                       │
        └───────────────────────┼───────────────────────┐
                                ▼                       │
                    ┌───────────────────────┐           │
                    │    Growth Engine       │◄──────────┘
                    │ affiliates · email ·  │  (also uses
                    │ notifications · CRM   │   relationship data)
                    └───────────────────────┘
```

**Money loop (explicit):**

`Document Engine` → `Payment Intent Layer` → `Revenue & Ops` (Payfast/Stripe) → `Webhook` → `Document Engine (Settle)`

**Get Paid loop (differentiator):**

`Observe` (`document_events`) + `Payment Intent` state → `Payment Intelligence Layer` → smart reminders/CTA/retry strategy → `Revenue & Ops` + `Experience System`

---

# Part B — Technical blueprint (stack & flow)

## B.1 What Paidly is (product one-liner)

Paidly is a **business operating system for SMBs**—not a narrow invoicing tool: **documents** (invoice / quote / payslip), **relationships & catalog**, **revenue visibility & payments**, and **growth** (e.g. affiliates) in one product story. **South Africa–first** (Payfast, ZAR defaults). **Stack:** **Vite + React** SPA on **Vercel**, **Supabase** as system of record.

## B.2 What runs where

| Layer | Technology | Role |
|--------|------------|------|
| **Frontend** | React 18, Vite 6, React Router 7 | UI; lazy routes |
| **Styling** | Tailwind, Radix, Framer Motion | Components + motion |
| **State** | TanStack Query, Zustand, Context | Cache, auth shell, prefs |
| **Data** | Supabase JS | Postgres, Auth, RLS |
| **APIs** | Vercel `/api/*` | Email, shares, Payfast, crons, affiliates |
| **Optional** | `server/` Express | PDF/email dev tooling |
| **Analytics** | `@vercel/analytics` | Prod only |

## B.3 External services

| Service | Role |
|---------|------|
| **Supabase** | DB + Auth (`VITE_SUPABASE_*`) |
| **Vercel** | Host + serverless + crons + redirects |
| **Payfast** | Payments / subscriptions |
| **Resend / SMTP** | Transactional email from `/api` |
| **Anvil** | PDF generation paths (tooling + app) |
| **Turnstile** | Signup / forgot-password bot resistance |

## B.4 Repository map

- `src/pages/` — route entrypoints (thin controllers)
- `src/components/layout/PageTemplate.jsx` — **Page Template System** (header + body grid + optional sticky side panel); `embedded` for `AdminLayout`
- `src/components/`, `src/services/` — feature + domain logic; **list/query orchestration** lives in `src/services/*` (called from hooks), not in pages
- `src/api/customClient.js` — `EntityManager` → Supabase (+ localStorage for unmigrated entities)
- `api/` — Vercel handlers
- `supabase/migrations/` — schema

See **`docs/SUPABASE_DATA_MODEL.md`** for table ↔ entity detail.

## B.5 Data flow (refined)

### Canonical client stack

Do **not** wire pages or heavy components **straight to** `Invoice`, `Quote`, etc. for anything beyond trivial one-offs. Prefer:

```
UI (pages / components)
  → Hooks (TanStack Query, local UI state)
    → Entity / domain service layer (`src/services/*`, orchestration)
      → Entity facades (`@/api/entities` — thin `EntityManager` API)
        → Supabase (+ RLS) / optional localStorage mirrors
```

**Why the middle layer:** one place for **timeouts/retries**, **logging/metrics**, **feature gating**, **error shaping**, and **swapping storage** without rewriting every screen. Hooks stay thin (cache keys, `enabled`, composition); services own **how** data is fetched or mutated.

**Anti-pattern:** `UI → Invoice.list()` scattered across pages.

**Reference example:** `useInvoices` → `fetchInvoiceListPage` in **`src/services/InvoiceListService.js`** → `Invoice.list` → `EntityManager` → Supabase. PDF/email/share flows stay in **`src/api/InvoiceService.js`** (different concern: delivery, not list reads).

### Canonical profile path (implemented)

Profile state has a single fetch owner:

- **Owner:** `AuthContext` (`src/contexts/AuthContext.impl.jsx`)
- **Consumer path:** `useAuth()` and `useUserProfileQuery()` (selector facade over auth state)
- **Rule:** pages/components should not add new `User.me()` fetches for normal shell state; use auth/context selectors.
- **Allowed exceptions:** explicit one-off snapshot reads in render/send pipelines (PDF generation, email send branding snapshots) where point-in-time profile capture is intentional.

### Domain-approved path matrix

| Domain | Approved path |
|---|---|
| Auth/profile | `AuthContext` → `useAuth` / `useUserProfileQuery` |
| Document lists | hook (`useInvoices`/etc.) → service (`*ListService`) → entity facade |
| Document exports | page action → `DocumentExportService` |
| Dashboard bounded data | dashboard hooks → `DashboardDataService` |
| Side datasets | feature hook with explicit `enabled` gate + stale time |

### `customClient.js` / EntityManager — online vs offline

`EntityManager` is powerful but easy to misuse: **silent failures**, **localStorage** paths for guests, and **`list()` timeouts** returning an empty cache can look like “no data” when the network failed.

**Policy (implemented in `EntityManager`):** use **`navigator.onLine`** as a coarse gate:

- **Offline** — do **not** call Supabase for bulk `pullFromSupabase` / empty `find()`; use **in-memory / local** only and **log** (`[Paidly][EntityManager] … offline`). **`get()`** cache misses throw a **clear** “not available offline” error instead of a failed network round-trip.
- **Online** — **attempt Supabase** as today. When `list()` uses a **`maxWaitMs` race**, the continuation **`pull` promise** logs failures instead of **`void pull.catch(() => {})`**, and an **empty cache** after the wait emits a **diagnostic warning** (slow vs failed vs still loading).

`skipLocalPersistence` (signed-in + mapped table) already avoids treating **localStorage** as authoritative; the online/offline split further reduces **masked** behaviour.

### Session and side effects

Auth session → org scope → the stack above + Query cache → **`/api/*`** for secrets and side effects (email, Payfast, public tokens, admin queues).

## B.6 Deployment

`vite build` → Vercel static + `vercel.json` rewrites + scheduled crons; production domains alias to the project.

---

## High impact next (product — what to ship first)

These three compound **retention**, **differentiation**, and the **business OS** story. Run them as explicit initiatives; the numbered backlog below is hygiene and scale in parallel.

### 1. Unify the document system

- **Invoice + quote = same engine** — one `document(type="invoice" | "quote")` mental model, shared **lifecycle** primitives (draft → send → observe → settle / convert), implemented through **`src/document-engine/`** and shared compose/send/PDF adapters (tables can stay split short term).
- **Shared UI** — one **Create / Edit document** shell (header, line items, preview, actions), **kind-specific** rules (tax, status machine, quote expiry vs invoice due) behind thin adapters—not two unrelated apps.

### 2. Client Timeline (inside client profile)

A single **chronological timeline** on the client record, for example:

- **Invoice sent** (and viewed / paid where data exists)
- **Quote sent / accepted / declined / expired**
- **Payment received** (linked payment rows)

**Data:** join `invoices`, `quotes`, `payments`, and optionally `document_sends` / `message_logs` (and later tasks/notes) filtered by `client_id` + `org_id`, sorted by time.

**Why it hits:** turns “contacts” into **relationship history**—high **retention** and a clear Paidly-only view most invoicing-only tools do not unify on one screen.

### 3. Conversion flow: Quote → accepted → auto invoice draft

When a quote moves to **accepted** (or explicit user action “Convert to invoice”):

1. **Create** an **invoice draft** (link `quote_id` or metadata for traceability).
2. **Prefill** client, line items, currency, terms/branding from the quote.
3. **Route** the user to **Edit invoice** (or unified **Edit document** with `type=invoice`) to review, adjust tax/dates, then send.

This closes the **commercial loop** in-product and is the flagship **document engine** workflow competitors rarely wire end-to-end.

---

## Foundation priorities (run with high impact)

Ship these in parallel with **High impact next**—they reduce churn and make every subsequent feature cheaper.

### 4. Stabilize Auth + Session (work already started)

- **Goal:** predictable **sign-in, refresh, tab sync, and logout**; no ghost states where the UI runs but org or profile is wrong.
- **Scope:** Supabase Auth session lifecycle, **`getSession` / `getUser`** ordering and retries (see patterns in **`customClient.js`**), **`RequireAuth`** and role gates, **org bootstrap** (`ensureUserHasOrganization`), **invite / reset-password** flows, **profile** load after cold start.
- **Exit criteria:** short **runbook** (or ADR) for “session failure modes + what the user sees”; fewer uncaught `AbortError` paths; QA checklist for multi-tab and slow network.

### 5. Standardize UI layout (same structure everywhere)

- **Goal:** one **layout grammar** across the app (see **A.2 — Standardize UI layout** table).
- **Scope:** roll **`PageTemplate`** through primary lists; align **document editors** on the same shell; admin/settings use **`embedded`** + `PageHeader` where applicable.
- **Exit criteria:** published **Experience checklist** (one page) that references **`PageTemplate`** and editor shell; new PRs default to an existing template row—no orphan layouts.

---

## Next steps (strategy → engineering backlog)

*Numbering map: **4–5** execute **Foundation §4–5** (auth/session, UI layout)—the same priorities called out in architecture **A.1** and **A.2**. **6** (Experience checklist) **closes** Foundation §5. **7** (role matrix) **supports** Foundation §4. Items **8–11** are the former 6–9 line-up (**PageTemplate** rollout, hook→service pattern, Client Timeline, quote→invoice). Product-led **High impact** items (§1–3) stay in that section above.*

1. **Grow `src/document-engine/`** — status enums, send + PDF adapters, and thin facades over `Invoice` / `Quote` / `Payslip` where behaviour overlaps (**supports § High impact 1**).
2. **Line up quote / invoice / payslip** on the same **deliver + observe** interfaces (even if tables stay separate short term); keep **compose** converging on **Create Document + type**, not parallel product UIs (**supports § High impact 1**).
3. **Add first-class Payment Intent model + APIs** — define intent create/update/reconcile contract between `Document Engine` and `Revenue & Ops` (idempotency, status normalization, expiry/retry rules).
4. **Make Revenue & Ops consumers explicit** — cash flow and reports should pull through document-shaped APIs or views, not ad hoc duplicates (**supports Client Timeline + money story**).
5. **Publish payment UX contract in Experience checklist** — one status vocabulary + CTA matrix for document detail, public invoice, and portal paths.
6. **Stabilize Auth + Session** — execute **Foundation §4** (session/read/write matrix, invites, org bootstrap, documentation).
7. **Standardize UI layout** — execute **Foundation §5** + **A.2** table (`PageTemplate`, editor shell, embedded admin).
8. **Publish an “Experience checklist”** (1 page) for new screens touching documents or money — include the **Page Template** three-zone rule (`PageTemplate`) and **layout grammar** row picker (**closes Foundation §5**).
9. **Identity / role matrix doc** — admin vs management vs support capabilities (complements §4).
10. **Roll out `PageTemplate`** on Invoices, Quotes, Clients, Services, and Affiliates — move filters/summary into **`sidePanel`** where they still live inside the main card.
11. **Extend the hook → service → entity pattern** — add `*ListService` / query modules for Quotes, Clients, and other high-traffic reads; keep **`api/InvoiceService`-style** modules for non-CRUD delivery concerns.
12. **Implement Client Timeline** — query + UI on **Client detail** per **High impact §2**; consider a small `ClientTimelineService` for aggregation and caching keys.
13. **Implement quote → invoice conversion** — server or client path that creates draft invoice from accepted quote per **High impact §3**; validate RLS and idempotency (no duplicate drafts on double-accept).

### Immediate execution order (exact)

1. **Add `payment_intents` table.**
2. **Integrate payment intents into the document lifecycle.**
3. **Expand `document_events` coverage and event ingestion.**
4. **Build payment UI into the sticky right panel on invoice/payment touchpoints.**
5. **Add basic reminders (event- and due-date driven).**

## v1 implementation contract (direct build plan)

### Tables (Supabase)

- `payment_intents` (new): `id`, `document_id`, `provider`, `amount`, `currency`, `status`, `external_id`, `created_at`
- `document_events` (expand): ensure canonical events `sent`, `opened`, `clicked`, `paid`, `reminded` with `occurred_at`, `actor_type`, `metadata`
- `payments` (existing): keep as settlement/reconciliation records linked to provider/webhook outcomes

### Services (app/server orchestration)

- `DocumentPaymentIntentService` (new): create/update intent from document snapshot; enforce idempotency by `document_id + provider + status window`
- `DocumentEventService` (expand): append normalized document/payment lifecycle events; provide query helpers for timeline/reminders
- `PaymentWebhookReconciliationService` (new or expanded from current Payfast handler): verify provider payloads, map to canonical statuses, write `payments` + `document_events`, trigger settle transition
- `PaymentIntelligenceService` (v1 basic): evaluate reminder triggers (e.g., viewed-not-paid, due/overdue windows) and emit follow-up actions

### Cron jobs (Vercel)

- `POST /api/cron/reminders` (existing pattern; expand logic): process due/overdue + behavior-based reminder candidates
- `POST /api/cron/payment-intelligence` (new): run lightweight trigger evaluation (`viewed>=N && not paid`, retry windows)
- `POST /api/cron/subscriptions-dunning` (existing/adjacent): keep tenant billing and subscription retries isolated from document settlement logic

### API endpoints (`/api/*`)

- `POST /api/payment-intents` (new): create intent for payable document
- `GET /api/payment-intents/:id` (new): fetch intent status for sticky panel + public views
- `POST /api/payments/webhook/:provider` (new canonical route; may proxy existing `payfast-handler`)
- `POST /api/documents/:type/:id/events` (new internal endpoint) or service-only ingestion path for `document_events`
- `POST /api/reminders/dispatch` (new internal endpoint used by cron workers)

**v1 acceptance checks:**

- Invoice can move `Deliver → Observe → Payment Intent → Settle` using provider-verified events only.
- Sticky right panel shows intent-aware CTA states (`Pay now`, `Retry payment`, `Send reminder`) without page-specific logic forks.
- `document_events` powers timeline entries and at least one automated reminder trigger.

---

*End of document.*
