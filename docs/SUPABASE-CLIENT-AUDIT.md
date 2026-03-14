# Supabase client audit — single client, no duplicates

## Frontend app: single source of truth

**File:** `src/lib/supabaseClient.js`

- The Supabase browser client is **created once** here with `createClient(effectiveUrl, effectiveKey, options)` and exported as `supabase`.
- **All app code must use:**  
  `import { supabase } from "@/lib/supabaseClient"`  
  (or `import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient"` when needed).
- Do **not** call `createClient()` from `@supabase/supabase-js` anywhere else in the app.

## Current import list (all use `@/lib/supabaseClient`)

| File | Import |
|------|--------|
| `src/api/customClient.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/api/businessGoals.js` | `import { supabase } from '@/lib/supabaseClient'` |
| `src/components/auth/AuthContext.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/components/invoice/InvoicePreview.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/components/notifications/NotificationBell.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/components/shared/LogoImage.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/hooks/useSupabaseRealtime.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/AdminInvoicesQuotes.jsx` | `import { supabase } from '@/lib/supabaseClient'` |
| `src/pages/AdminSubscriptions.jsx` | `import { supabase } from '@/lib/supabaseClient'` |
| `src/pages/Calendar.jsx` | `import { supabase } from '@/lib/supabaseClient'` |
| `src/pages/CreateInvoice.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/Invoices.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/Quotes.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/Settings.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/SystemStatus.jsx` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/pages/index.jsx` | `import { isSupabaseConfigured } from "@/lib/supabaseClient"` |
| `src/services/ActivityNotificationService.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/services/AdminSupabaseSyncService.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/services/billingService.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/services/SupabaseAuthService.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/services/SupabaseMultiBucketService.js` | `import { supabase } from "@/lib/supabaseClient"` |
| `src/services/SupabaseStorageService.js` | `import { supabase } from "@/lib/supabaseClient"` |

## Other runtimes (intentionally separate clients)

These create their own Supabase client because they run in different environments (Node, serverless, Edge) with different env vars and/or service role keys:

| Location | Purpose |
|----------|---------|
| `server/src/supabaseAdmin.js` | Server-side admin client with **service role** key. Not shared with frontend. |
| `supabase/functions/payfast-itn/index.ts` | Edge function; creates client with service role in Deno runtime. |
| `api/send-email.js` | Serverless/API route; creates its own client (e.g. Vercel env). |
| `scripts/verify-supabase-config.js` | Node script; creates a client for the script (uses `process.env`). |
| `scripts/verify-database-setup.js` | Node script; same as above. |

## Changes made in this audit

1. **`src/lib/supabaseClient.js`**  
   - Documented that this is the **single** Supabase client for the frontend and that `createClient()` must not be called elsewhere in the app.

2. **`src/services/billingService.js`**  
   - Updated from `import { supabase } from "./supabaseClient"` to `import { supabase } from "@/lib/supabaseClient"`.

3. **`src/services/supabaseClient.js`**  
   - **Removed.** It only re-exported `supabase` from `@/lib/supabaseClient`. All consumers now import from `@/lib/supabaseClient` directly.

## No duplicate client in app code

- **`src/api/customClient.js`** exports a function named `createClient` and a `customClient` instance: that is the **Break API** entity layer factory, not the Supabase client. It imports the single Supabase client: `import { supabase } from "@/lib/supabaseClient"`.
- **`src/api/apiClient.js`** uses `createClient` from `./customClient` (Break API), not from `@supabase/supabase-js`.

Result: the Supabase client is created once in `src/lib/supabaseClient.js` and reused everywhere in the app via that single export.
