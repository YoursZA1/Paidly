// API utility to sync users from Supabase and filter only Supabase users
import axios from "axios";

export async function syncSupabaseUsers() {
  try {
    const response = await axios.get("/api/admin/sync-users");
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
