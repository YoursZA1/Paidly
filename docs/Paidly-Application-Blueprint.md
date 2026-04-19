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

*One-page upgrade summary. Part A below expands **Relationship & Offering** as its own system—the client/catalog **input graph** that feeds the Document Engine.*

Paidly is structured around **four core engines**:

1. **Identity System** — Auth, users, organizations, roles, RLS-backed tenancy.
2. **Document Engine** — Invoices, quotes, payslips unified as `document(type=…)`; shared compose, send, and PDF paths.
3. **Financial Engine** — Payments, cash flow, reports, subscriptions (reads and rails **downstream of** documents).
4. **Growth Engine** — Affiliates, email, notifications, CRM-style behaviour (how Paidly scales).

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

**You already have (in shipped or advanced form):** invoices, quotes, payslips (unified as **documents**), clients, reporting, affiliates, and the plumbing for payments, subscriptions, and cash visibility.

**Competitive edge:** most tools **excel at one slice** (invoicing-only, or accounting-only, or a disconnected referral program). **Few competitors unify** issuance (document engine), relationship/catalog input, financial read models, and growth mechanics **under one coherent architecture** and vocabulary. That unification—**Document → Financial → Growth** engines plus shared **Experience**—is the defensible story: not “another invoice PDF,” but **operating the business** in one system.

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

## A.1 The five core systems

These are the **real** architecture—not the sidebar.

### 1. Identity & Access System

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

**Reframe:** not “invoices vs quotes vs payslips” but **one engine**:

| Document kind | Today’s surface | Same engine primitives |
|---------------|-----------------|---------------------------|
| **Invoice** | Invoices, recurring | Draft → send → view/track → pay / remind |
| **Quote** | Quotes, templates | Draft → send → accept/expire → convert |
| **Payslip** | Payslips | Draft → send → employee view |

**Shared lifecycle (conceptual):**

`Author` → `Compose` (lines, tax, branding) → `Render` (PDF/HTML) → `Deliver` (email, link, portal) → `Observe` (opens, reminders) → `Settle` (payment, acceptance, archive)

**Why this matters for product:**

- One **mental model** for PM, design, and eng.
- One place to invest: **send pipeline**, **PDF pipeline**, **public token model**, **status vocabulary**, **line-item model**.
- Feature parity (e.g. quote send = invoice send) becomes **engine work**, not three copies.

**Technical anchor today:** `Invoice` / `Quote` / `Payslip` entities + `InvoiceSendService`-style orchestration + `/api/send-email` + public share routes. **In code:** `src/document-engine/` exports `DOCUMENT_TYPES`, `normalizeDocumentType`, `parseRouteDocumentTypeStrict`, `getDocumentEntity`, `documentRef`—use these for routing, analytics, and new engine code. **Roadmap:** grow this module (shared send/PDF adapters, shared status vocabulary) so new document kinds plug in, not fork.

#### Product upgrade: one compose surface, many kinds

The **big upgrade** is not more list pages—it is **one mental journey**:

1. **Create Document** (single entry pattern: compose, brand, line items).
2. **Configure type** — `invoice` / `quote` / `payslip` (and future kinds)—as a **property of the document**, not a separate app area.
3. **Same UI** — shared shell, editors, preview, send affordances (Experience System + document templates).
4. **Different logic** — status machines, tax/settlement rules, payroll vs AR: **kind-specific adapters** behind the same surface.

List routes (“Invoices”, “Quotes”) remain **indexes and filters** over `document(type=…)`; they are not where the product story starts.

---

### 3. Relationship & Offering System

**Job:** **Who** you sell to and **what** you sell—data that **feeds** the Document Engine.

- **Clients** (CRM): contact, terms, portal access
- **Catalog** (`services`): products & services, pricing, inventory where relevant
- **Line items** on documents: snapshots + links back to catalog when useful

**Strategy:** Treat this as the **input graph** to commerce—not a separate “Contacts app.” List screens are views; the system is **relationship + SKU/rate intelligence**. Growth-oriented **CRM behaviour** (follow-ups, nudges, sequences) lives primarily in the **Growth Engine**; this system owns **master data** and what gets embedded on documents.

---

### 4. Financial Engine

**Job:** Everything that turns **issued documents** (especially invoices) into **cash, visibility, and tenant billing**—without re-implementing document authoring here.

- **Payments:** Payfast, invoice payment state, webhooks (`api/payfast-handler`)
- **Cash flow:** timelines and balances built from documents + payments
- **Reports:** read models and exports on top of documents + payments + catalog where relevant
- **Subscriptions & dunning:** how Paidly bills the customer (packaging, crons in `vercel.json` → `/api/cron/...`)

**Feeds off the Document Engine:** financial truth is **downstream of document state** (totals, status, due dates, line items). The Financial Engine aggregates, reconciles, and projects; it does not fork “another invoice.”

**Strategy:** Keep business rules that define **what a document is** (e.g. when an invoice is *overdue* in product terms) aligned with the Document Engine; keep **money rails** (capture, allocate, subscription charge) here.

---

### 5. Growth Engine

**Job:** How Paidly **acquires, retains, and scales**—loops that sit beside day-to-day issuing.

- **Affiliates:** acquisition + admin moderation (`api/affiliates`, …)
- **Emails:** transactional and campaign-style sends from `/api` and app-triggered flows
- **Notifications:** in-app + scheduled nudges (crons, reminders, due-date services)
- **CRM behaviour:** follow-ups, client engagement, portal nudges—**behaviour** on top of Relationship data, not a duplicate CRM product

**This is how Paidly scales:** repeatable growth mechanics without entangling them in the document compose path.

**Operator / platform admin** (users, oversight, platform messages, `/admin-v2/*`) can be documented as part of this engine or Identity, depending on audience—treat it as **platform operations**, not SMB document logic.

---

## A.2 Cross-cutting: Experience System (UX at scale)

**Job:** So Paidly **feels** like one product, not twenty features stitched together.

**Pillars:**

| Pillar | Meaning |
|--------|---------|
| **Shell** | Repeated editor layout: full-width work area, `max-w-*` content, sticky summary/actions (pattern already emerging: EditQuote, EditClient, EditCatalogItem). |
| **Tokens** | `border-border`, `bg-card`, `text-muted-foreground`—no one-off palette per page. |
| **Data discipline** | React Query keys, invalidation rules, “hydrate from cache then refresh” for perceived speed. |
| **A11y & forms** | Label/`id` parity, focus order, disabled states that explain *why* (title/tooltip). |
| **Page template** | List/index pages share one **three-zone** shell (below)—visual consistency reads as **premium**. |

**Strategy:** Treat “Experience” as **governed**: a short **layout + form checklist** for any new surface that touches Identity or the Document Engine—same as you’d gate API changes.

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
        │                       │ feeds (read models, state)
        │                       ▼
        │            ┌───────────────────────┐
        │            │   Financial Engine    │
        │            │ pay · cash flow ·     │
        │            │ reports · subs        │
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

---

# Part B — Technical blueprint (stack & flow)

## B.1 What Paidly is (product one-liner)

Paidly is a **business operating system for SMBs**—not a narrow invoicing tool: **documents** (invoice / quote / payslip), **relationships & catalog**, **financial visibility & payments**, and **growth** (e.g. affiliates) in one product story. **South Africa–first** (Payfast, ZAR defaults). **Stack:** **Vite + React** SPA on **Vercel**, **Supabase** as system of record.

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
3. **Make Financial Engine consumers explicit** — cash flow and reports should pull through document-shaped APIs or views, not ad hoc duplicates (**supports Client Timeline + money story**).
4. **Stabilize Auth + Session** — execute **Foundation §4** (session/read/write matrix, invites, org bootstrap, documentation).
5. **Standardize UI layout** — execute **Foundation §5** + **A.2** table (`PageTemplate`, editor shell, embedded admin).
6. **Publish an “Experience checklist”** (1 page) for new screens touching documents or money — include the **Page Template** three-zone rule (`PageTemplate`) and **layout grammar** row picker (**closes Foundation §5**).
7. **Identity / role matrix doc** — admin vs management vs support capabilities (complements §4).
8. **Roll out `PageTemplate`** on Invoices, Quotes, Clients, Services, and Affiliates — move filters/summary into **`sidePanel`** where they still live inside the main card.
9. **Extend the hook → service → entity pattern** — add `*ListService` / query modules for Quotes, Clients, and other high-traffic reads; keep **`api/InvoiceService`-style** modules for non-CRUD delivery concerns.
10. **Implement Client Timeline** — query + UI on **Client detail** per **High impact §2**; consider a small `ClientTimelineService` for aggregation and caching keys.
11. **Implement quote → invoice conversion** — server or client path that creates draft invoice from accepted quote per **High impact §3**; validate RLS and idempotency (no duplicate drafts on double-accept).

---

*End of document.*
