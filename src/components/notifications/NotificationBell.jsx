import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { Bell } from "lucide-react";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      setFetchError(null);
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) {
          console.warn("NotificationBell: get user failed", getSupabaseErrorMessage(userError, "Get user failed"));
          return;
        }
        const user = userData?.user;
        if (!user) return;
        const { data, error } = await supabase
          .from("notifications")
          .select("id, message, created_at, read")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (error) {
          console.warn("NotificationBell: fetch notifications failed", getSupabaseErrorMessage(error, "Load notifications failed"));
          setFetchError(getSupabaseErrorMessage(error, "Failed to load notifications"));
          return;
        }
        setNotifications(data ?? []);
        setUnreadCount((data ?? []).filter((n) => !n.read).length);
      } catch (err) {
        const msg = getSupabaseErrorMessage(err, "Failed to load notifications");
        console.warn("NotificationBell:", msg);
        setFetchError(msg);
      }
    };
    fetchNotifications();
    const channel = supabase
      .channel("notifications-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, fetchNotifications)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white shadow-lg rounded-xl z-50 border border-gray-200">
          <div className="p-3 border-b font-semibold text-gray-700">Notifications</div>
          <ul className="max-h-80 overflow-y-auto">
            {fetchError ? (
              <li className="p-4 text-amber-600 text-sm">{fetchError}</li>
            ) : notifications.length === 0 ? (
              <li className="p-4 text-gray-500 text-sm">No notifications</li>
            ) : (
              notifications.map((n) => (
                <li key={n.id} className={`p-4 border-b last:border-b-0 ${n.read ? "bg-white" : "bg-blue-50"}`}>
                  <div className="text-sm text-gray-800">{n.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}