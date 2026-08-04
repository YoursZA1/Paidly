---
pdf_options:
  format: A4
  margin: 16mm
  printBackground: true
---

# Paidly — Shareholder Product Overview

**Confidential · For shareholders & advisors**  
**Product:** Paidly (https://www.paidly.co.za)  
**Positioning:** Business operating system for SMBs — South Africa–first  
**Status date:** July 2026

---

## 1. What Paidly is

Paidly is **not** a narrow invoicing app. It is a **financial workflow platform** for small and medium businesses: one place to issue commercial documents, manage clients and catalog, collect payment, see cash performance, and grow through channels such as affiliates.

**Mission:** Help businesses get paid faster by reducing friction between sending a document and receiving money.

**Investor framing:** Shift the story from “another invoice PDF tool” to **operating the business money loop** end-to-end — Document → Payment Intent → Settlement → Intelligence (reminders & follow-ups).

**Geographic focus:** South Africa–first (PayFast payments, ZAR defaults), with multi-currency support in product.

---

## 2. The problem we solve

Most SMB tools excel at **one slice**:

| Typical tool | Gap |
|--------------|-----|
| Invoicing-only | Weak relationships, weak cash intelligence, bolted-on payments |
| Accounting-only | Heavy; slow path from “quote sent” to “money in” |
| Standalone referral / CRM | Disconnected from documents and payment state |

**Paidly’s edge:** unify issuance, relationships/catalog, revenue/ops, and payment intelligence under **one coherent product architecture** — so the business runs in one system, not five tabs.

---

## 3. How the product operates (simple money loop)

```
Create document (invoice / quote / payslip)
        ↓
Compose (line items, tax, branding)
        ↓
Deliver (email, public link, client portal)
        ↓
Observe (opens, clicks, reminders)
        ↓
Payment intent → PayFast / rails
        ↓
Settle (paid / accepted / archived)
        ↓
Intelligence (smart reminders, at-risk follow-ups)
```

**Day-to-day for a business owner:**

1. Add clients and catalog (services/products).
2. Create invoices, quotes, or payslips with branded PDFs.
3. Send via email or shareable link; track views.
4. Collect payment (PayFast) and record partial payments where needed.
5. Use dashboard, cash flow, and reports for visibility.
6. Grow via affiliates and team/company workspaces.

---

## 4. Core product systems

Paidly is built as **named systems** (not a random page list):

| System | Job | Shareholder takeaway |
|--------|-----|----------------------|
| **Identity** | Auth, users, organizations, roles, secure tenancy (RLS) | Multi-user, company-ready foundation |
| **Document Engine** | Invoices, quotes, payslips as one commerce core | Shared compose → send → PDF → track path |
| **Relationship** | Clients + catalog that feed documents | CRM + SKU intelligence as input, not a bolt-on |
| **Payment Intent** | Canonical handoff from document to payment rails | Multi-provider readiness; payments not “hacked onto pages” |
| **Revenue & Ops** | Payments, cash flow, reports, SaaS subscriptions, POS | Cash visibility + how Paidly bills its own tenants |
| **Payment Intelligence** | Reminders, nudges, “viewed but unpaid” triggers | Collection velocity — the Get Paid differentiator |
| **Experience** | Consistent UI shell, money CTAs, layout system | Feels like one premium product, not 20 features |
| **Growth** | Affiliates, email, notifications, CRM behaviour | Acquisition and retention loops beside day-to-day issuing |

---

## 5. What has been built (capability inventory)

### 5.1 Commercial documents (Document Engine)

| Capability | Status |
|------------|--------|
| Invoices — create, edit, draft/send, view, PDF, branding | **Shipped** |
| Recurring invoices — create/edit, pause/resume, cycle tracking | **Shipped** |
| Quotes — create, edit, templates, public view, PDF | **Shipped** |
| Payslips — create, edit, view, public share, PDF | **Shipped** |
| Unified document vocabulary & shared list/export patterns | **Advanced** (code-level unification; tables still per type) |
| Public share links (invoice / quote / payslip) | **Shipped** |
| Send + delivery tracking (email / opens) | **Shipped** (continue deepening event model) |
| Partial payments on invoices | **Shipped** |
| Tax / VAT support | **Shipped** |
| Multi-currency | **Shipped** |

### 5.2 Relationships & catalog

| Capability | Status |
|------------|--------|
| Clients CRM (list, detail, edit, search, CSV) | **Shipped** |
| Services / catalog & inventory surfaces | **Shipped** |
| Client portal | **Shipped** |
| Company / multi-brand workspace | **Shipped / advanced** |
| Team invites & memberships | **Shipped** |

### 5.3 Money, billing & visibility

| Capability | Status |
|------------|--------|
| PayFast invoice / payment flows (return, cancel, ITN) | **Shipped** |
| SaaS subscription billing v2 (plans, subscriptions, verified ITN, payment history, admin revenue views) | **Advanced / shipping** |
| Cash flow views & PDF | **Shipped** |
| Reports & exports | **Shipped** |
| Dashboard KPIs | **Shipped** |
| POS integrations (Yoco / Square connect, sales events, stock hooks) | **Shipped / advanced** |
| Budgets, expenses, accounting-adjacent screens | **Present** (continue productizing) |

### 5.4 Growth & platform

| Capability | Status |
|------------|--------|
| Affiliate program (apply, landing, dashboard, admin moderation) | **Shipped** |
| Platform admin (users, oversight, messaging, subscriptions) | **Shipped** (Admin v2 surface) |
| Waitlist / marketing site surfaces | **Shipped** |
| SEO / structured data on marketing homepage | **Shipped** |

### 5.5 Security, reliability & operations

| Capability | Status |
|------------|--------|
| Supabase Auth + Row Level Security (tenant isolation) | **Shipped** (ongoing hardening) |
| Session recovery, sleep/wake locks, realtime JWT rotation | **Advanced** |
| Rate limiting, abuse protection, secrets scanning | **Shipped** |
| Automated reminders / cron jobs | **Shipped** |
| Runtime coordination (query cache, mutation dedupe, request budgeting) | **Advanced** |
| CI checks (forbidden admin writes, session boundaries, e2e smoke) | **Shipped** |

**Architecture maturity (internal estimate):** ~**70%** of the SaaS operating system is in place. The remaining ~**30%** that defines long-term defensibility is: payment abstraction at scale, unified document event intelligence, and experience consistency across every money surface.

---

## 6. How the technology works (non-technical)

| Layer | What it is | Why it matters |
|-------|------------|----------------|
| **Web app** | React SPA (Vite), hosted on Vercel | Fast product iteration; modern UX |
| **Database & auth** | Supabase (Postgres + Auth + Storage + Realtime) | Secure multi-tenant data; live updates |
| **Serverless APIs** | Vercel `/api/*` | Payments, email, public shares, crons — secrets stay server-side |
| **Payments** | PayFast | Local SA payment rail; SaaS billing verified server-side (never trust the browser) |
| **Email** | Resend / SMTP | Invoice/quote delivery and transactional mail |

**Data path (simplified):**  
User interface → application services → database (with security rules) → payment/email APIs when money or delivery is involved.

---

## 7. Competitive narrative (for the room)

**Old lens:** “We have invoices, quotes, clients…”  
**New lens:** One **Document Engine**, one **money loop**, one **Get Paid** intelligence layer.

Competitors typically win one vertical. Paidly’s thesis is **workflow ownership**:

- Issue professionally branded commercial documents  
- Know who bought what (clients + catalog)  
- Collect and reconcile payment safely  
- Remind and prioritize unpaid work intelligently  
- Grow distribution via affiliates  
- Operate the company with admin, roles, and subscriptions  

That stack is the **defensible story** for shareholders: not feature count, but **system coherence**.

---

## 8. Near-term product priorities

These are the highest-leverage next investments (from product architecture strategy):

1. **Deepen Document Engine unification** — one compose/send/PDF mental model for invoice, quote, payslip (persistence can remain split short-term).
2. **Client Timeline** — full history on each client (documents, payments, engagement).
3. **Quote → accepted → draft invoice** — conversion that closes the sales-to-AR loop.
4. **First-class Payment Intent model** — cleaner multi-provider path and consistent Pay / Retry / Receipt UX everywhere.
5. **Payment Intelligence v1** — e.g. “viewed 3× unpaid → reminder + suggested follow-up.”
6. **Foundation (parallel):** continue auth/session hardening and UI layout standardization so every new feature ships cheaper.

---

## 9. Business model (platform)

Paidly is a **SaaS subscription** product:

- Plans and features are catalog-driven (not hardcoded in the UI).
- Tenant subscriptions activate only after **verified** PayFast Instant Transaction Notifications (ITN) — frontend cannot fake “paid.”
- Append-only payment history and subscription event timeline support auditability and admin oversight.
- Affiliate channel supports acquisition without building a separate growth product.

---

## 10. One-page summary for the board

| Question | Answer |
|----------|--------|
| **What is it?** | SMB business operating system for documents, relationships, payments, and growth |
| **Where?** | South Africa–first; live product at paidly.co.za |
| **Who uses it?** | Small businesses, freelancers, teams with company workspaces |
| **What’s shipped?** | Invoices, quotes, payslips, clients, catalog, PayFast, cash/reports, affiliates, admin, portal, recurring billing plumbing |
| **What’s left for moat?** | Payment abstraction, document event intelligence, quote→invoice conversion, experience consistency |
| **Tech posture?** | Modern cloud stack (Vercel + Supabase + PayFast); security-first billing; multi-tenant RLS |
| **Ask of shareholders?** | Align on **workflow platform** narrative; fund completion of the Get Paid / Payment Intent layer that turns invoicing into collection velocity |

---

## Appendix A — Feature map (user-facing areas)

- **Home / marketing** — positioning, waitlist, SEO  
- **Auth** — signup, login, invite, password reset  
- **Dashboard** — KPIs and daily operating view  
- **Documents hub** — invoices, quotes, payslips, recurring  
- **Clients** — CRM + detail + portal  
- **Services / inventory** — catalog  
- **Cash flow & reports** — money visibility  
- **Settings / company / billing** — branding, bank details, plan  
- **Affiliates** — apply, track, admin  
- **Admin platform** — users, revenue, messaging, oversight  
- **Integrations** — POS (Yoco, Square)

## Appendix B — Related internal documents

| Document | Audience |
|----------|----------|
| `docs/Paidly-Application-Blueprint.md` (+ PDF) | Product + engineering (canonical architecture) |
| `docs/HOW_EVERYTHING_CONNECTS.md` | Engineering onboarding |
| `docs/SUBSCRIPTION_BILLING_SCHEMA.md` | Billing / compliance depth |
| `docs/SECURITY_AND_COMPLIANCE.md` | Security posture |

---

*Prepared from the Paidly Application Blueprint and current product surfaces. For investor diligence, treat engineering docs as source of truth on implementation detail; this overview is the shareable narrative layer.*
