# Branding Rendering Flow

**Date:** 2026-09-03  
**Scope:** Company logo across app header, invoice/quote previews, PDFs, and email templates.

**Document issuer branding (invoices, quotes, public pages, PDF):** `src/lib/documentIssuerBrand.js` is the only priority list. Same model as `docs/MULTIBRAND_COMPANIES.md`. Do not add a competing snapshot-first chain in templates.

```
Current Business Brand / live profile
        ↓
documentIssuerBrand.js
        ↓
Document issuer branding
        ↓
Invoice / quote / PDF / public document
```

---

## Data Sources

Two different surfaces, two helpers:

| Surface | Helper | What it resolves |
|---|---|---|
| App header / dashboard chrome | `useCompanyBrand()` | Live organization Business Logo only |
| Invoice, quote, public document, PDF | `documentIssuerBrand.js` | Issuer name + logo for that document |

### App chrome (`useCompanyBrand`)

```
1. profile.logo_url / company_logo_url   — official Business Logo (full profiles row)
2. user.logo_url / company_logo_url      — auth session (may be minimal on cold load)
3. user.user_metadata.company_logo_url / avatar_url — OAuth leftover
```

Does **not** read `owner_logo_url` or `companies.logo_url`.

### Commercial documents (`resolveIssuerLogoPath`)

```
1. document.document_logo_url     — compose override for this document
2. company.logo_url               — assigned brand mark (invoices.company)
3. Live Business Logo             — profiles.logo_url (latest official logo)
4. document.owner_logo_url        — create-time snapshot; fallback only
5. selectedBrand.logo_url         — header brand, compose default only
```

`owner_logo_url` is still written when a document is created (`snapshotForNewDocument`). It must not override the current Business Logo when that live logo exists.

Issuer **name** (`resolveIssuerName`) is slightly different: compose name → assigned brand name → `owner_company_name` → selected brand → profile name.

---

## `useCompanyBrand()` Hook

**File:** `src/hooks/useCompanyBrand.js`

**Behaviour:**
1. Reads `{ user, profile }` from `useAuth()`.
2. Uses `profile || user` as the primary source — `profile` is the full profiles-table row; `user` may be a minimal JWT snapshot during initial auth hydration.
3. Calls `resolveProfileLogoUrl(source)` → returns `source.logo_url ?? source.company_logo_url ?? ""`.
4. Passes the raw path to `AssetService.getLogo(rawPath)`.
5. If `getLogo` returns `FALLBACK_LOGO` (invalid path, known-failed URL, or validation failure), sets `hasLogo = false`.
6. Returns `{ logoPath, logoUrl, initials, companyName, hasLogo }`.

**Key invariant:** `hasLogo` is `false` until the logo URL is confirmed valid by `AssetService`. The avatar always renders initials as the base layer so there is never an empty container.

---

## App Header Rendering

### Desktop sidebar (expanded)

```jsx
<div className="relative w-7 h-7 rounded-lg ...">
  <span aria-hidden>{initials}</span>        ← always present (base layer)
  {brand.hasLogo && (
    <Logo                                    ← overlays initials when resolved
      path={brand.logoPath}
      className="absolute inset-0 object-cover"
    />
  )}
</div>
```

### Desktop top-bar profile button

Same two-layer pattern using `brand.initials` and `brand.hasLogo`.

### Mobile top-bar avatar + mobile nav footer avatar

Same two-layer pattern; `brand` is passed as a prop to `MobileNav`.

### Fallback chain inside `Logo` component

```
1. resolveDisplaySrc(path) → AssetService.getLogo(path) → public Supabase URL
2. If image errors → /fallback-logo.png
3. If fallback also errors → /icon.svg
```

---

## Invoice / Quote Preview Rendering

**File:** `src/components/invoice/templates/UnifiedInvoiceTemplate.jsx`

Logo path resolution at render time:

```js
const logoPath = resolveIssuerLogoPath({
  document: invoice,
  company: invoice?.company,
  profile: user,
});
```

Public invoice/quote pages, `DocumentPreview`, and `documentPreviewData.js` use the same two functions. Do not inline `owner_logo_url` ahead of the live profile.

Renders:
```jsx
{logoPath ? (
  <LogoImage src={logoPath} className="max-h-[64px] max-w-[180px] object-contain" />
) : (
  <div className={`h-16 w-16 rounded-sm ${cfg.logoFallback}`} aria-hidden />
)}
```

`LogoImage` uses the public `paidly` URL (`getPublicUrl`). Public invoice viewers never depend on signed URLs. Settings previews may pass `preferSignedUrl`.

---

## PDF Capture

**File:** `src/components/pdf/InvoiceTemplatePdfCapture.jsx`

`buildInvoiceTemplatePdfCaptureProps` sets `resolvedUser.logo_url` / `company_name` from `resolveIssuerLogoPath` / `resolveIssuerName` (live Business Logo before `owner_logo_url`).

The same `UnifiedInvoiceTemplate` renders into the DOM and is then captured to PDF via `html2canvas` + `jsPDF`. `LogoImage` adds `crossOrigin="anonymous"` for Supabase-hosted URLs so `html2canvas` can include the image cross-origin.

**Important:** Never pass `blob:` URLs into PDF capture — they are revoked after the tab navigates and won't render in async PDF jobs. `AssetService.getLogo` returns the canonical `https://` public URL, not a blob.

---

## Email Templates

**File:** `src/utils/brandedEmailTemplates.js`  
**File:** `src/utils/quoteEmailHtml.js`  
**File:** `src/components/invoice/EmailPreviewModal.jsx` (exports `generateInvoiceEmailHtml`)  
**File:** `src/components/reminders/PaymentReminderService.jsx`

Logo is embedded as an `<img src="...">` using the resolved Supabase public URL. Each email builder resolves the logo via `AssetService.getLogo(company.logo_url || company.company_logo_url)` and passes it to `buildBrandedEmailDocumentHtml` as `logoUrl`. The template renders it only when the URL starts with `https://` (validated inline — blob and relative paths are suppressed).

Maximum width in email: `160px` inline style (`max-width`, not `width`, so it scales down on mobile clients). Maximum height: `56px`. Displayed above the email body content, below the gradient header band.

---

## Known Edge Cases

| Scenario | Behaviour |
|---|---|
| Logo file deleted from Supabase storage | Public URL returns 404; `Logo`/`LogoImage` `onError` fallback fires; `markStorageAssetFailed` caches the failure for 5 minutes |
| Profile loads slowly (cold auth hydration) | `brand.hasLogo = false` initially; initials show; logo appears once `profile.logo_url` populates (React re-renders on `profile` change) |
| Logo path with unsupported characters | `isValidLogoStorageObjectKey` returns false; `getLogo` returns `FALLBACK_LOGO`; `hasLogo = false` |
| OAuth user with `avatar_url` but no uploaded logo | `useCompanyBrand` picks up `user_metadata.avatar_url` as the logo path |
