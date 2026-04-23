// User management API utilities (calls backend / Vercel /api/admin/*)
import { backendApi } from "./backendClient";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

async function adminAuthHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(getSupabaseErrorMessage(error, "Session error"));
  }
  const token = data?.session?.access_token;
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { Authorization: `Bearer ${token}` };
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

// Update user profile subscription plan and metadata
export async function updateUserSubscription(userId, plan, user_metadata = {}) {
  const headers = await adminAuthHeaders();
  return backendApi.put(
    `/api/admin/users/${userId}`,
    {
      plan,
      user_metadata,
    },
    { headers }
  );
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
