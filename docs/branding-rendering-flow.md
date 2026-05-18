# Branding Rendering Flow

**Date:** 2026-05-18  
**Scope:** Company logo across app header, invoice/quote previews, PDFs, and email templates.

---

## Data Sources (Priority Order)

```
1. profile.logo_url            — Full profiles-table row (freshest after auth settles)
2. profile.company_logo_url    — Legacy alias in profiles table
3. user.logo_url               — Auth-session user (may be "minimal" during cold hydration)
4. user.company_logo_url       — Legacy alias in auth session user
5. user.user_metadata.company_logo_url  — OAuth provider metadata
6. user.user_metadata.avatar_url        — OAuth avatar fallback
7. invoice.owner_logo_url              — Snapshot snapped at invoice-creation time
8. invoice.company.logo_url            — Org table snapshot
```

Priority 1–2 are accessed via `useCompanyBrand()` (reads from `profile` first, then `user`).  
Priority 7–8 are used in invoice/quote templates as fallback when the live profile logo is absent.

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
const logoPath =
  user?.logo_url ||
  user?.company_logo_url ||
  invoice?.owner_logo_url ||
  invoice?.company?.logo_url ||
  null;
```

Renders:
```jsx
{logoPath ? (
  <LogoImage src={logoPath} className="max-h-[64px] max-w-[180px] object-contain" />
) : (
  <div className={`h-16 w-16 rounded-sm ${cfg.logoFallback}`} aria-hidden />
)}
```

`LogoImage` runs `AssetService.getLogo(src)` internally and renders a loading skeleton while the URL resolves.

---

## PDF Capture

**File:** `src/components/pdf/InvoiceTemplatePdfCapture.jsx`

`buildInvoiceTemplatePdfCaptureProps` assembles `resolvedUser.logo_url` from:
```js
user.logo_url || user.company_logo_url || invoice?.owner_logo_url || invoice?.company?.logo_url
```

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
