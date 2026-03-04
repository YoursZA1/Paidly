/**
 * Activity notifications: create and manage notifications for invoice/quote activities.
 * Uses Supabase public.notifications (user_id, message, read) directly.
 * Use for: payment recorded, and rely on DB triggers for viewed/accepted (client may not be owner).
 */

import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";

export async function createActivityNotification(userId, message) {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      message,
      read: false,
    });
    if (error) {
      console.warn("ActivityNotification: create failed", getSupabaseErrorMessage(error, "Create notification failed"));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("ActivityNotification: create failed", getSupabaseErrorMessage(err, "Create notification failed"));
    return false;
  }
}

/** Create a notification for the current user (e.g. after they record a payment). RLS allows only user_id = auth.uid(). */
export async function notifyCurrentUser(message) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return false;
    return createActivityNotification(userId, message);
  } catch {
    return false;
  }
}

export async function markNotificationRead(notificationId) {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);
    if (error) {
      console.warn("ActivityNotification: mark read failed", getSupabaseErrorMessage(error, "Update failed"));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("ActivityNotification: mark read failed", getSupabaseErrorMessage(err, "Update failed"));
    return false;
  }
}

export async function markAllNotificationsReadForCurrentUser() {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;
    if (!userId) return false;
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) {
      console.warn("ActivityNotification: mark all read failed", getSupabaseErrorMessage(error, "Update failed"));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
