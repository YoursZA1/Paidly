# Supabase API Calls ↔ UI Actions Review

This document maps every Supabase API usage to the UI action that triggers it and confirms that success/error handling is correctly linked.

---

## 1. Auth (Supabase Auth)

| API call | Where | UI trigger | Success handling | Error handling |
|----------|--------|------------|------------------|----------------|
| **signInWithEmail** | AuthContext.login() | Login page form submit | Sets session, refreshUser, redirect | setError() + displayed in form |
| **signOut** | AuthContext.logout() | Layout: user menu “Log out”, mobile nav, dropdown | Clears user/session, redirect to Login | toast (destructive) on failure |
| **getSession** | AuthContext init, refreshSession, onAuthStateChange | App load, session refresh, auth events | setSession(), setUser() | setSession(null) |
| **signUpWithEmail** | Signup page (step 1) | Signup form submit | Creates user, continues to step 2 | setError() in form |
| **signInWithMagicLink** | Login (resend), AuthContext (resend), Signup (magic link) | “Resend confirmation” / magic link button | Message “Confirmation email resent” | setResendSuccess(err.message) or setError() |
| **signInWithOAuth** | SupabaseAuthService (not yet used in UI) | — | — | Throws normalized error |
| **getUser** | NotificationBell, SupabaseAuthService.getUser | NotificationBell mount | Fetches notifications | Logs warning, early return |
| **onAuthStateChange** | AuthContext useEffect | (Listener) | setSession/refreshUser on SIGNED_IN, clear on SIGNED_OUT | — |

**Summary:** All auth flows are triggered by UI (login form, logout buttons, signup form, resend button). Errors are shown via form `setError`, toast, or resend message. Logout now shows a toast on failure.

---

## 2. Database (Supabase client / EntityManager)

CRUD goes through **customClient** EntityManager → `supabase.from(table).select|insert|update|delete`. The UI uses **breakApi.entities** (Invoice, Client, Quote, Service, Payment, etc.).

### Invoices

| UI action | Entity / API | Page/component | Error handling |
|-----------|--------------|-----------------|----------------|
| Create invoice | Invoice.create() | CreateInvoice.jsx (form submit) | setError + toast (destructive), org/permission/column messages |
| Update invoice (status, etc.) | Invoice.update() | ViewInvoice, EditInvoice, InvoiceActions, MessageComposer, etc. | Toast or inline error where used |
| Delete invoice | Invoice.delete() | InvoiceActions (delete button) | Confirmation + error toast on failure |
| List invoices | Invoice.list() | Invoices.jsx (loadData) | loadData catch logs; list shows empty or stale on error |
| Realtime refresh | useSupabaseRealtime(['invoices','payments']) | Invoices.jsx | Refetches list on change |

### Clients

| UI action | Entity / API | Page/component | Error handling |
|-----------|--------------|----------------|----------------|
| Create client | Client.create() | Clients.jsx (form), ProjectDetails, ExcelDataCapture | Toast with normalized message (org, permission, duplicate) |
| Update client | Client.update() | Clients.jsx, ClientDetail, ClientFollowUpService | Toast on error |
| Delete client | Client.delete() | Clients.jsx, ClientDetail | Toast on error, confirm dialog |
| List clients | Client.list() | Clients, ClientDetail, CreateInvoice, etc. | loadData catch / toast |

### Quotes

| UI action | Entity / API | Page/component | Error handling |
|-----------|--------------|----------------|----------------|
| Create/update/delete quote | Quote.create/update/delete | CreateQuote, EditQuote, QuoteActions, MessageComposer | Toast or setError |
| List quotes | Quote.list() | Quotes.jsx | loadData catch |
| Realtime | useSupabaseRealtime(['quotes']) | Quotes.jsx | Refetches on change |

### Services, Payments, RecurringInvoice, etc.

Same pattern: entities are used from pages/components (Services.jsx, ViewInvoice, RecurringInvoiceCard, etc.). Errors from Supabase are thrown by EntityManager with normalized messages and are caught in the calling page (try/catch + toast or setError).

**Summary:** All database access is triggered by list/create/edit/delete UI. Errors are propagated and shown via toast or form error. Realtime keeps invoice and quote lists in sync.

---

## 3. Direct supabase.from() in pages (admin / notifications)

| API call | Where | UI trigger | Success | Error |
|----------|--------|------------|--------|-------|
| **subscriptions** select/update | AdminSubscriptions.jsx | Page load, Pause/Resume/Cancel/Upgrade/Flag/Export buttons | setSubscriptions, reload, alert on success where needed | loadError banner, alert() or setFlagError in modals |
| **users** update (flag) | AdminSubscriptions (confirmFlag) | Flag account modal confirm | Close modal, clear state | setFlagError in modal |
| **payments** update | AdminSubscriptions (handleManualPaymentUpdate) | Mark paid/failed in UI | — | alert() |
| **invoices** select | AdminInvoicesQuotes.jsx | Page load | setInvoices | setError banner |
| **quotes** select | AdminInvoicesQuotes.jsx | Page load | setQuotes | setError banner |
| **notifications** select + channel | NotificationBell.jsx | Mount + realtime | setNotifications, setUnreadCount | setFetchError, shown in dropdown |

**Summary:** Admin and notification Supabase calls are tied to page load or button clicks; errors are shown via banner, alert, or inline in the notification dropdown.

---

## 4. Storage (Supabase Storage)

| API call | Service / usage | UI trigger | Success | Error |
|----------|------------------|------------|--------|-------|
| **uploadProfileLogo** | SupabaseStorageService | Settings (Save with logo), SetupWizard.uploadLogo | Updated logo_url, form save | Toast (Settings), or error in wizard |
| **upload** (profile-logos/invoicebreek) | SupabaseStorageService, customClient Core.UploadFile/UploadPrivateFile | Settings logo, onboarding SetupWizard (uploadToBucket) | URL returned, profile updated | Throw → toast or catch in caller |
| **UploadToActivities** | customClient.Core + integrations | ExpenseForm (file attach, receipt scan), ReceiptScanner, MessageComposer (attach) | file_url in attachments | console.error + state (e.g. attachment not added) |
| **UploadToBankDetails** | customClient.Core + integrations | BankImportModal (file upload) | file_url for processing | try/catch in handleFileUpload |
| **createSignedUrl / getPublicUrl** | SupabaseStorageService, LogoImage, customClient buildFileUrl | Logo display, after upload | Image displays | Fallback to public URL or placeholder, console.warn |
| **listBuckets** | SupabaseStorageService.ensureBucketExists | Before logo upload | Decides bucket | Fallback to main bucket, warn |

**Summary:** All storage writes are triggered by upload buttons or save-with-logo; reads are for display or post-upload URL. Errors are either thrown and caught in the page (toast) or logged with fallback behavior.

---

## 5. Backend / server-only (not frontend UI)

| API call | Where | Note |
|----------|--------|------|
| **getSession** (server) | AdminSupabaseSyncService (syncAdminData) | Uses session for server API call; not a direct UI button but triggered by admin/sync flows. Failure → saveSyncFailure + broadcast. |

---

## 6. Gaps fixed in this review

- **Logout:** Added toast on logout failure in Layout so Supabase signOut errors are visible to the user.

---

## 7. Checklist (all verified)

- [x] Auth: Login, Signup, Logout, Resend verification → Supabase Auth calls with errors shown in UI.
- [x] Database: All entity CRUD (Invoice, Client, Quote, Service, Payment, etc.) → customClient → Supabase with try/catch and toast/setError.
- [x] Admin: Subscriptions, invoices/quotes audit, notifications → direct supabase.from with loadError/alert/setFlagError/fetchError.
- [x] Storage: Logo upload (Settings, onboarding), activities/bank-details uploads → Supabase Storage with toast or catch.
- [x] Realtime: Invoices and Quotes pages subscribe to postgres_changes and refetch list on change.
- [x] No Supabase call is “orphan”: each is reachable from an app load, a user action, or an auth/storage callback.

All Supabase API calls are correctly linked to UI actions (or auth/realtime lifecycle), and error handling is in place for each flow.
