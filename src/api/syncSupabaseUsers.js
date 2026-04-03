// API utility to sync users from Supabase (calls backend / Vercel /api/admin/sync-users)
import { fetchSupabaseUsers } from "./userManagement";

export async function syncSupabaseUsers() {
  try {
    return await fetchSupabaseUsers();
  } catch (error) {
    console.error("Failed to sync Supabase users:", error);
    return [];
  }
}
