/**
 * Env resolution for admin affiliate E2E (Playwright runs in Node — VITE_* are only set if exported in the shell).
 *
 * Local: copy `playwright/env.e2e.example` → `.env.e2e` and fill values; admin Playwright config loads `.env.e2e`.
 *
 * Required for UI + API tests:
 * - E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD — management/admin login
 * - Supabase URL + anon key: E2E_SUPABASE_URL + E2E_SUPABASE_ANON_KEY, or export VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 * - Service role (seed/cleanup): E2E_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY
 *
 * Node API (affiliate list): start with PLAYWRIGHT_START_API=1 or run `npm run server`; app should use VITE_SERVER_URL=http://127.0.0.1:5179
 */

export function resolveSupabaseUrl(): string | undefined {
  const v =
    process.env.E2E_SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  return v || undefined;
}

export function resolveSupabaseAnonKey(): string | undefined {
  const v =
    process.env.E2E_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim();
  return v || undefined;
}

export function resolveServiceRoleKey(): string | undefined {
  const v =
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return v || undefined;
}

/** Node API base (no trailing slash). */
export function resolveApiBase(): string {
  const raw =
    process.env.PLAYWRIGHT_API_URL?.trim() ||
    process.env.VITE_SERVER_URL?.trim() ||
    'http://127.0.0.1:5179';
  return raw.replace(/\/$/, '');
}

export type AdminAffiliateE2ePrereqs = {
  adminEmail: string | undefined;
  adminPassword: string | undefined;
  supabaseUrl: string | undefined;
  supabaseAnon: string | undefined;
  serviceRole: string | undefined;
  ok: boolean;
};

export function adminAffiliateE2ePrereqs(): AdminAffiliateE2ePrereqs {
  const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || undefined;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || undefined;
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnon = resolveSupabaseAnonKey();
  const serviceRole = resolveServiceRoleKey();
  const ok = Boolean(adminEmail && adminPassword && supabaseUrl && supabaseAnon && serviceRole);
  return { adminEmail, adminPassword, supabaseUrl, supabaseAnon, serviceRole, ok };
}
