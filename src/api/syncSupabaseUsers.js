// API utility to sync users from Supabase (calls backend at VITE_SERVER_URL)
import { backendApi } from "./backendClient";

export async function syncSupabaseUsers() {
  try {
    const response = await backendApi.get("/api/admin/sync-users");
    if (response.data && response.data.users) {
      // Only return users that exist in Supabase
      return response.data.users;
    }
    return [];
  } catch (error) {
    console.error("Failed to sync Supabase users:", error);
    return [];
  }
}
