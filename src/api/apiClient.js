import { createClient } from './customClient';

/**
 * Single authenticated API client for the app.
 * `customClient` is an alias — do not construct a second client via createClient in app code.
 */
export const breakApi = createClient({
  appId: "6887a9d49af4acc63ae9062f",
  requiresAuth: true,
});

export const customClient = breakApi;

export { createClient } from './customClient';
export { selectProfileByUserId } from "@/api/auth/profileSelect.js";
export { clearSessionOrgIdCache } from "@/api/auth/orgCache.js";
