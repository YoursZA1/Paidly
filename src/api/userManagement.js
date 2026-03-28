// User management API utilities (calls backend at VITE_SERVER_URL)
import { backendApi } from "./backendClient";

// Fetch all Supabase users
export async function fetchSupabaseUsers() {
  const response = await backendApi.get("/api/admin/sync-users");
  return response.data.users || [];
}

// Update user role
export async function updateUserRole(userId, role) {
  return backendApi.post("/api/admin/roles", { userId, role });
}

// Delete user
export async function deleteUser(userId) {
  return backendApi.delete(`/api/admin/users/${userId}`);
}

// Add new user
export async function addUser(email, fullName, role) {
  return backendApi.post("/api/admin/users", { email, fullName, role });
}

// Sync users and clean up orphaned users
export async function syncAndCleanUsers() {
  const supabaseUsers = await fetchSupabaseUsers();
  await backendApi.post("/api/admin/clean-orphaned-users");
  return supabaseUsers;
}

// Update user profile subscription plan and metadata
export async function updateUserSubscription(userId, plan, user_metadata = {}) {
  return backendApi.put(`/api/admin/users/${userId}`, {
    plan,
    user_metadata,
  });
}
