import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { markNotificationRead, markAllNotificationsReadForCurrentUser } from "@/services/ActivityNotificationService";
import { Bell, CheckCheck } from "lucide-react";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setFetchError(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        const msg = getSupabaseErrorMessage(userError, "Get user failed");
        if (!/session missing|not authenticated|invalid jwt/i.test(msg)) {
          console.warn("NotificationBell: get user failed", msg);
        }
        return;
      }
      const user = userData?.user;
      if (!user) return;
      const { data, error } = await supabase
        .from("notifications")
        .select("id, message, created_at, read")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
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
  }, []);

  useEffect(() => {
    fetchNotifications();
    const channel = supabase
      .channel("notifications-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, fetchNotifications)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    const ok = await markNotificationRead(id);
    if (ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const handleMarkAllRead = async () => {
    const ok = await markAllNotificationsReadForCurrentUser();
    if (ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  const formatTime = (createdAt) => {
    const d = new Date(createdAt);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return "Just now";
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="relative">
      <button
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Bell className="size-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-[min(24rem,70vh)] bg-card shadow-lg rounded-xl z-50 border border-border">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold text-foreground">Activity</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {fetchError ? (
                <li className="p-4 text-destructive text-sm">{fetchError}</li>
              ) : notifications.length === 0 ? (
                <li className="p-4 text-muted-foreground text-sm">No notifications yet. Activity from invoices and quotes will appear here.</li>
              ) : (
                notifications.map((n) => (
                  <li
                    key={n.id}
                    className={`p-3 border-b border-border last:border-b-0 ${n.read ? "bg-transparent" : "bg-primary/5"}`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!n.read) handleMarkRead(n.id);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && !n.read) handleMarkRead(n.id);
                      }}
                      className="text-sm text-foreground cursor-default"
                    >
                      {n.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{formatTime(n.created_at)}</div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}