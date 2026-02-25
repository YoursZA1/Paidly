// User management API utilities for best practice
import axios from "axios";

// Fetch all Supabase users
export async function fetchSupabaseUsers() {
  const response = await axios.get("/api/admin/sync-users");
  return response.data.users || [];
}

// Update user role
export async function updateUserRole(userId, role) {
  return axios.post("/api/admin/roles", { userId, role });
}

// Delete user
export async function deleteUser(userId) {
  return axios.delete(`/api/admin/users/${userId}`);
}

// Add new user
export async function addUser(email, fullName, role) {
  return axios.post("/api/admin/users", { email, fullName, role });
}

// Sync users and clean up orphaned users
export async function syncAndCleanUsers() {
  // Fetch users from Supabase
  const supabaseUsers = await fetchSupabaseUsers();
  // Optionally, call backend endpoint to clean orphaned users
  await axios.post("/api/admin/clean-orphaned-users");
  return supabaseUsers;
}
