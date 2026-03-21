# Paidly App

This app was created automatically by Paidly.
It's a Vite+React app that communicates with the Paidly API.

**Production app:** [https://invoicebreekapp2.vercel.app](https://invoicebreekapp2.vercel.app)

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
Open the URL shown (e.g. `http://localhost:5173`). The app uses Supabase for auth and data. For admin sync and some features you can start the backend in another terminal: `npm run server` (see below).

**If you see "Connection refused" or "Backend unavailable":**  
The frontend proxies `/api` to the backend in dev. If you use admin features or see backend errors, start the backend: `npm run server` (runs on `http://localhost:5179` by default). The app will still load without it; only backend-dependent features will show a message.

**Production build and preview:**
```bash
npm run build
npm start
# or: npm run preview
```

### Deployment (Vercel)

The app is deployed at **https://invoicebreekapp2.vercel.app**. For Vercel (or similar):

1. **Environment variables** (Vercel → Project → Settings → Environment Variables): set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and optionally `VITE_SERVER_URL` (your backend API URL) and `VITE_SUPABASE_STORAGE_BUCKET`. Use **Production** (and Preview if needed).
2. **Supabase Auth:** In Supabase Dashboard → **Authentication → URL Configuration**, add `https://invoicebreekapp2.vercel.app` to **Site URL** and **Redirect URLs** so sign-in, password reset, and OAuth work.
3. **Backend CORS:** If you run the API server separately, set `CLIENT_ORIGIN=https://invoicebreekapp2.vercel.app` so the server allows requests from the frontend.

The repo includes a `vercel.json` that routes all paths to `index.html` for client-side routing.

## Environment variables

Required for Supabase (auth and storage) and for the backend API. Vite loads `.env` from the project root; only variables prefixed with `VITE_` are exposed to the client.

1. Copy the example file and fill in your values:
   ```bash
   # For development, copy the development example file.
   cp .env.development.example .env.development
   ```
2. Set these in `.env.development`:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `VITE_SUPABASE_URL` | Yes | Supabase project URL (Settings → API). |
   | `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key (Settings → API). |
   | `VITE_SERVER_URL` | No | Backend API base URL (default: `http://localhost:5179`). |
   | `VITE_SUPABASE_STORAGE_BUCKET` | No | Storage bucket name (default: `invoicebreek`). |

If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, the app will load but show a "Supabase not configured" message. **Don't expose keys:** Never commit `.env` or paste API keys in code, issues, or chat. Use `.env.*.example` as templates; keep real values only in local `.env` (gitignored) and in your host's environment (e.g. Vercel). The repo uses `.cursorignore` so env and auth state are not included in AI context. If a key was ever exposed, rotate it in Supabase and update env. Never commit `.env` files (they are gitignored); use the `.env.*.example` files as templates locally, and use your host’s environment or a secrets manager in production. Run **`npm run scan-secrets`** before releases; GitHub Actions runs it plus **TruffleHog** on every push/PR to `main`/`master` (see **`.github/workflows/security-secrets.yml`**). See **`docs/SECRETS_AND_ENV.md`** for browser vs server variables, CI, and enabling **GitHub secret scanning** in repo settings. For HTTPS, CORS, monitoring, and database exposure in production, see **`docs/DEPLOYMENT_SECURITY.md`**. For API/auth rate limits and bot resistance, see **`docs/ABUSE_PROTECTION.md`**.

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