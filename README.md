# InvoiceBreak App

This app was created automatically by InvoiceBreak.
It's a Vite+React app that communicates with the InvoiceBreak API.

## Development & Build

| Command | Purpose |
|--------|---------|
| `npm run dev` | Start the development server (hot reload). |
| `npm run build` | Create a production build (output in `dist/`). |
| `npm run preview` or `npm start` | Serve and preview the production build locally. |
| `npm test` | Run unit tests (watch mode). |
| `npm run test:run` | Run unit tests once. |
| `npm run test:coverage` | Run tests and generate coverage. |

**Quick start (development):**
```bash
npm install
npm run dev
```

**Production build and preview:**
```bash
npm run build
npm start
# or: npm run preview
```

## Environment variables

Required for Supabase (auth and storage) and for the backend API. Vite loads `.env` from the project root; only variables prefixed with `VITE_` are exposed to the client.

1. Copy the example file and fill in your values:
   ```bash
   cp .env.example .env
   ```
2. Set these in `.env`:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `VITE_SUPABASE_URL` | Yes | Supabase project URL (Settings → API). |
   | `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key (Settings → API). |
   | `VITE_SERVER_URL` | No | Backend API base URL (default: `http://localhost:5179`). |
   | `VITE_SUPABASE_STORAGE_BUCKET` | No | Storage bucket name (default: `invoicebreek`). |

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, the app will throw on load. **Store credentials securely:** never commit `.env` (it is gitignored); use `.env.example` as the template locally, and use your host’s environment or a secrets manager in production.

## Supabase & database

CRUD for **clients**, **services**, **invoices**, **quotes**, and **payments** is performed via the Supabase client (see `src/api/customClient.js`). Data models align with the Supabase schema in `supabase/schema.postgres.sql`.

**For environment setup and ongoing maintenance**, start with **[docs/SUPABASE_SETUP_AND_MAINTENANCE.md](docs/SUPABASE_SETUP_AND_MAINTENANCE.md)** (env vars, new project, common tasks). For **admin features** and how they use Supabase, see **[docs/ADMIN_FEATURES_AND_SUPABASE.md](docs/ADMIN_FEATURES_AND_SUPABASE.md)**.

- Table mapping and schema: **[docs/SUPABASE_DATA_MODEL.md](docs/SUPABASE_DATA_MODEL.md)**
- Storage (buckets, uploads, policies): **[docs/SUPABASE_STORAGE.md](docs/SUPABASE_STORAGE.md)**
- Realtime (live updates): **[docs/SUPABASE_REALTIME.md](docs/SUPABASE_REALTIME.md)**
- Security (RLS, keys): **[docs/SUPABASE_SECURITY.md](docs/SUPABASE_SECURITY.md)**
- Access restrictions & compliance: **[docs/SECURITY_AND_COMPLIANCE.md](docs/SECURITY_AND_COMPLIANCE.md)**
- API ↔ UI mapping: **[docs/SUPABASE_UI_REVIEW.md](docs/SUPABASE_UI_REVIEW.md)**
- Testing and log monitoring: **[docs/TESTING.md](docs/TESTING.md)**

## Import Consistency: Vite @ Alias

All imports from the `src/components` directory (and subdirectories) must use the Vite `@` alias:

```
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/notifications/NotificationBell";
```

**Do not use relative imports like `../components/...` anywhere in the codebase.**

### Vite Config

The Vite config (`vite.config.js`) is set up as follows:

```js
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  envDir: '.',  // load .env from project root; VITE_* vars exposed to client
});
```

### Why?
- **Consistency**: Cleaner, easier to refactor, and avoids import path errors.
- **Portability**: No need to adjust imports when moving files.
- **Vite Compatibility**: The `@` alias is supported and configured.

### Migration
If you add or move files, always use the `@/components/...` import style.

If you see any `../components/...` imports, replace them with `@/components/...` immediately.

---

_Last updated: 2026-02-16_