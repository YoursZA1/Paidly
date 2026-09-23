// User management API utilities (calls backend / Vercel /api/admin/*)
import { backendApi } from "./backendClient";
import { getAuthBearerHeadersOrThrow } from "@/lib/rpcSessionPolicy";

async function adminAuthHeaders() {
  return getAuthBearerHeadersOrThrow("user-management-missing-token");
}

// Fetch all Supabase users (Dashboard admin block + sync)
export async function fetchSupabaseUsers() {
  const headers = await adminAuthHeaders();
  const response = await backendApi.get("/api/admin/sync-users", { headers });
  return response.data.users || [];
}

// Update user role
export async function updateUserRole(userId, role) {
  const headers = await adminAuthHeaders();
  return backendApi.post("/api/admin/roles", { userId, role }, { headers });
}

// Delete user
export async function deleteUser(userId) {
  const headers = await adminAuthHeaders();
  return backendApi.delete(`/api/admin/users/${userId}`, { headers });
}

// Add new user
export async function addUser(email, fullName, role) {
  const headers = await adminAuthHeaders();
  return backendApi.post("/api/admin/users", { email, fullName, role }, { headers });
}

// Sync users and clean up orphaned users
export async function syncAndCleanUsers() {
  const headers = await adminAuthHeaders();
  const supabaseUsers = await fetchSupabaseUsers();
  await backendApi.post("/api/admin/clean-orphaned-users", {}, { headers });
  return supabaseUsers;
}

export async function bulkUpdateUsers(ids, data) {
  const headers = await adminAuthHeaders();
  const response = await backendApi.post(
    "/api/admin/users/bulk-update",
    { ids, data },
    { headers }
  );
  return response.data;
}

/**
 * Admin package change for the user's company. Changes the company subscription (the billing
 * source of truth) server-side; profiles.plan is refreshed by the subscriptions → profiles trigger.
 * @param {string} userId
 * @param {"none"|"starter"|"business"|"growth"|"enterprise"} plan
 * @param {string} [reason]
 */
export async function setCompanyPlan(userId, plan, reason) {
  const headers = await adminAuthHeaders();
  const response = await backendApi.post(
    "/api/admin/subscriptions",
    { action: "set_company_plan", user_id: userId, plan, reason },
    { headers }
  );
  return response.data;
}

/**
 * Admin pause / resume of a user's company access. Access lives on the company subscription
 * (suspended | active), not on profiles: no data, package, trial or billing history is touched.
 * @param {string} userId
 * @param {"paused"|"active"} access
 * @param {string} [reason]
 */
export async function setCompanyAccess(userId, access, reason) {
  const headers = await adminAuthHeaders();
  const response = await backendApi.post(
    "/api/admin/subscriptions",
    { action: "set_company_access", user_id: userId, access, reason },
    { headers }
  );
  return response.data;
}

/**
 * Admin-facing message for a failed admin action: the server's reason when it sent one, else a
 * plain fallback. Schema/driver details stay in the dev console, never in the toast.
 * @param {unknown} err
 * @param {string} fallback
 */
export function adminActionErrorMessage(err, fallback) {
  const serverMessage = err?.response?.data?.error;
  if (import.meta.env?.DEV) console.error("[admin action]", err?.response?.data || err);
  if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage.trim();
  return fallback;
}
