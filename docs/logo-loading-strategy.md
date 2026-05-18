# Logo Loading Strategy

**Date:** 2026-05-18  
**Scope:** How company logos are fetched, validated, cached, and rendered across all surfaces.

---

## Storage Architecture

| Bucket | Purpose |
|---|---|
| `paidly` | Current primary logo bucket |
| `company-logos` | Legacy bucket (still read; never written) |

Logos are stored as public objects. `AssetService.getLogo(path)` calls `supabase.storage.from(bucket).getPublicUrl(cleanedPath)` which is **synchronous** — no network round-trip for URL generation, only for the eventual image fetch.

---

## URL Resolution Pipeline

```
Raw input (path or URL)
        │
        ▼
resolveLogoSource(path)
  ├─ Strips blob:/data: early → returned as-is
  ├─ Full https:// URL → extract path after /paidly/ or /company-logos/
  └─ Short path → strip storage prefixes, detect bucket from path prefix
        │
        ▼
isValidLogoStorageObjectKey(cleaned)
  Rules:
    - Not empty
    - Length 1–768 chars
    - No path traversal (..)
    - No leading slash, no double slash
    - No control characters
    - Charset: /^[a-zA-Z0-9._\-/%+]+$/
        │
  INVALID → return FALLBACK_LOGO ("/fallback-logo.png")
        │
  VALID ↓
        ▼
Session memory cache (Map, max 500 entries)
  HIT + not known-failed → return cached URL
        │
  MISS ↓
        ▼
Disk cache (localStorage key per input path)
  HIT + not known-failed → populate session cache, return URL
        │
  MISS ↓
        ▼
supabase.storage.getPublicUrl(cleaned)
  → write to disk cache + session cache
  → return publicUrl
```

---

## Failure Caching

`markStorageAssetFailed(url)` records a URL in `failedUrlExpiry` (in-memory Map) with a **5-minute TTL**. Any subsequent call to `getLogo` or `isStorageAssetKnownFailed` skips the URL and returns `FALLBACK_LOGO` for the TTL window.

This prevents the browser from hammering a 404 URL on every render. After 5 minutes, the TTL expires and the URL is tried again — relevant after the user re-uploads a logo.

---

## Component-Level Loading

### `Logo` component (`src/components/shared/Logo.jsx`)

Lightweight, memo'd. Used in the app header.

```
Stage 0: primary resolved URL (AssetService.getLogo)
Stage 1: /fallback-logo.png  (on image error)
Stage 2: /icon.svg            (if fallback also errors)
```

Tracks stage via `stageRef` (not React state) so errors don't retrigger network requests on re-renders.

### `LogoImage` component (`src/components/shared/LogoImage.jsx`)

Richer, with loading skeleton. Used in invoice/quote templates and DocumentLayout.

- `isLoading = true` → renders `bg-gray-100 animate-pulse` skeleton
- `imageSrc = null` → resolving (shows skeleton)
- `hasError = true` → renders fallback PNG
- Optional `preflightStorage` prop → HEAD-probes the URL before setting `src` (strictest mode; adds ~1 req but catches stale references before they break PDF captures)
- Adds `crossOrigin="anonymous"` for Supabase URLs to enable `html2canvas` cross-origin capture

---

## `useCompanyBrand()` Hook

Reads `{ user, profile }` from `useAuth()`. `profile` is the full profiles-table row; `user` may be a minimal auth-session snapshot during cold hydration. Uses `profile || user` as the primary source so the logo appears as soon as the profile row loads, not just after the full session user is rebuilt.

Returns:
- `hasLogo` — pre-validated; only `true` when `getLogo` returns a non-fallback URL
- `logoPath` — raw stored path (suitable for `<Logo path={...}>`)
- `logoUrl` — resolved public URL (suitable for direct `<img src={...}>`)
- `initials` — always available as fallback
- `companyName`

---

## Sizing Guidelines

| Surface | Max size |
|---|---|
| App header avatar | 28–40 px height (rounded, object-cover) |
| Invoice/Quote header | `max-h-[64px] max-w-[180px]` object-contain |
| PDF capture | Same as Invoice/Quote header |
| Email templates | `max-width: 160px` inline style |

---

## Rules for PDF & Email

1. **Never use `blob:` URLs** in PDF generation or email templates. Blob URLs are tab-scoped and revoked on navigation. Always use the canonical `https://` public URL from `AssetService.getLogo`.
2. **`crossOrigin="anonymous"`** is required on `<img>` elements captured by `html2canvas` when the image is hosted on a different origin (Supabase storage). `LogoImage` adds this automatically for Supabase URLs.
3. **Email clients** strip `<style>` blocks. Use only inline styles for logo sizing. Avoid `object-fit: contain` — use `max-width` / `max-height` with `display: block`.

---

## Avoiding Flicker

The two-layer avatar pattern prevents layout shift:

```jsx
<div className="relative w-8 h-8 rounded-xl ... overflow-hidden">
  <span aria-hidden>{brand.initials}</span>   {/* always rendered */}
  {brand.hasLogo && (
    <Logo
      path={brand.logoPath}
      className="absolute inset-0 w-full h-full object-cover"
    />
  )}
</div>
```

- Initials are always in the DOM (no conditional render, no layout shift).
- `Logo` is absolutely positioned on top; if it fails to load, the fallback image shows, but the initials underneath remain as the visual base (they are covered by the fallback image at stage 1).
- `brand.hasLogo` is only `true` after URL validation succeeds, so the Logo element is never mounted with a provably-invalid URL.
