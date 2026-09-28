/**
 * Enter / leave an employee portal in this tab. Switching workforce context drops every client cache that is
 * keyed by user rather than by business (org id cache, company context, app store, TanStack Query memory +
 * persisted snapshots) so one business's data is never shown in another's context — then the caller does a
 * full navigation so in-memory entity caches start clean too. Portal tabs never persist or hydrate query
 * snapshots at all (shouldPersistReactQueryKey), and the app store is keyed by user + context.
 *
 * Authorization is unaffected: the database/server decide every request (see portalState.js).
 */
import { clearOrgIdCache } from "@/api/auth/orgCache.js";
import { clearCompanyAccessContextCache } from "@/services/CompanyContextService";
import { clearTenantContextCache } from "@/services/TenantRoleService";
import { clearOnboardingContextCache } from "@/services/OnboardingRoleService";
import { useAppStore } from "@/stores/useAppStore";
import { getOrCreateAppQueryClient } from "@/lib/query-client";
import { clearPersistedQueryCache } from "@/lib/paidlyIdbQueryPersistence";
import {
  clearActivePortalSlug,
  getActivePortalSlug,
  setActivePortalSlug,
} from "@/lib/workforcePortal/portalState.js";

async function clearContextCaches() {
  clearOrgIdCache();
  clearCompanyAccessContextCache();
  clearTenantContextCache();
  clearOnboardingContextCache();
  try {
    useAppStore.getState().reset();
  } catch {
    /* store not initialised */
  }
  try {
    getOrCreateAppQueryClient().clear();
  } catch {
    /* no query client yet */
  }
  await clearPersistedQueryCache();
}

/**
 * Work inside `/employee/<slug>` in this tab. Call only after resolve_my_workforce_portal said ok — the
 * server re-checks on every request anyway.
 * @param {string} slug
 */
export async function enterWorkforcePortal(slug) {
  if (getActivePortalSlug() === slug) return;
  setActivePortalSlug(slug);
  await clearContextCaches();
}

/** Back to the user's own business context (or no context) in this tab. */
export async function exitWorkforcePortal() {
  if (!getActivePortalSlug()) return;
  clearActivePortalSlug();
  await clearContextCaches();
}
