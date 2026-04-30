import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { markNotificationRead, markAllNotificationsReadForCurrentUser } from "@/services/ActivityNotificationService";
import { Bell, CheckCheck } from "lucide-react";

const REALTIME_REFRESH_DEBOUNCE_MS = 350;

export default function NotificationBell() {
  const { authUserId } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const panelId = useId();
  const headingId = useId();
  const triggerRef = useRef(null);
  const realtimeDebounceRef = useRef(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!authUserId) {
      setUnreadCount(0);
      return;
    }
    try {
      const [{ count: activityUnreadCount, error: activityUnreadError }, { count: inAppUnreadCount, error: inAppUnreadError }] =
        await Promise.all([
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("user_id", authUserId)
            .eq("read", false),
          supabase
            .from("message_deliveries")
            .select("id", { count: "exact", head: true })
            .eq("user_id", authUserId)
            .eq("channel", "in_app")
            .is("read_at", null),
        ]);
      if (activityUnreadError) {
        console.warn(
          "NotificationBell: fetch activity unread count failed",
          getSupabaseErrorMessage(activityUnreadError, "Unread count failed")
        );
      }
      if (inAppUnreadError) {
        console.warn(
          "NotificationBell: fetch in-app unread count failed",
          getSupabaseErrorMessage(inAppUnreadError, "Unread count failed")
        );
      }
      setUnreadCount(Number(activityUnreadCount || 0) + Number(inAppUnreadCount || 0));
    } catch (err) {
      console.warn("NotificationBell: unread count fetch failed", getSupabaseErrorMessage(err, "Unread count failed"));
    }
  }, [authUserId]);

  const fetchNotifications = useCallback(async () => {
    if (!authUserId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, message, created_at, read")
        .eq("user_id", authUserId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        console.warn("NotificationBell: fetch notifications failed", getSupabaseErrorMessage(error, "Load notifications failed"));
        setFetchError(getSupabaseErrorMessage(error, "Failed to load notifications"));
        return;
      }
      const { data: inAppMessages, error: inAppError } = await supabase
        .from("message_deliveries")
        .select(
          "id, message_id, status, sent_at, read_at, channel, admin_platform_messages(subject, content)"
        )
        .eq("user_id", authUserId)
        .eq("channel", "in_app")
        .order("sent_at", { ascending: false })
        .limit(20);
      if (inAppError) {
        console.warn("NotificationBell: fetch in-app messages failed", getSupabaseErrorMessage(inAppError, "Load in-app messages failed"));
      }

      const activityRows = (data ?? []).map((n) => ({
        id: `activity-${n.id}`,
        source: "activity",
        refId: n.id,
        message: n.message,
        createdAt: n.created_at,
        read: Boolean(n.read),
      }));
      const messageRows = (inAppMessages ?? []).map((row) => {
        const msg = Array.isArray(row.admin_platform_messages)
          ? row.admin_platform_messages[0]
          : row.admin_platform_messages;
        const subject = String(msg?.subject || "Message from Paidly").trim();
        const content = String(msg?.content || "").trim();
        return {
          id: `in-app-${row.id}`,
          source: "in_app",
          refId: row.id,
          message: content ? `${subject}: ${content}` : subject,
          createdAt: row.sent_at || null,
          read: row.read_at != null || String(row.status || "").toLowerCase() === "read",
        };
      });
      const merged = [...activityRows, ...messageRows]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 20);
      setNotifications(merged);
      setUnreadCount(merged.filter((n) => !n.read).length);
    } catch (err) {
      const msg = getSupabaseErrorMessage(err, "Failed to load notifications");
      console.warn("NotificationBell:", msg);
      setFetchError(msg);
    }
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return undefined;
    void fetchUnreadCount();
    const scheduleRefresh = () => {
      if (realtimeDebounceRef.current) {
        window.clearTimeout(realtimeDebounceRef.current);
      }
      realtimeDebounceRef.current = window.setTimeout(() => {
        void fetchUnreadCount();
        if (open) void fetchNotifications();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`notifications-changes-${authUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${authUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_deliveries", filter: `user_id=eq.${authUserId}` }, scheduleRefresh)
      .subscribe();
    return () => {
      if (realtimeDebounceRef.current) {
        window.clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [authUserId, fetchNotifications, fetchUnreadCount, open]);

  useEffect(() => {
    if (!authUserId) return;
    void fetchUnreadCount();
    if (open) {
      void fetchNotifications();
    }
  }, [authUserId, open, fetchNotifications, fetchUnreadCount]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleMarkRead = async (item) => {
    let ok = false;
    if (item.source === "activity") {
      ok = await markNotificationRead(item.refId);
    } else if (item.source === "in_app") {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("message_deliveries")
        .update({ read_at: nowIso, status: "read" })
        .eq("id", item.refId);
      ok = !error;
      if (error) {
        console.warn("NotificationBell: mark in-app message read failed", getSupabaseErrorMessage(error, "Mark read failed"));
      }
    }
    if (ok) {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const handleMarkAllRead = async () => {
    const ok = await markAllNotificationsReadForCurrentUser();
    if (ok) {
      const nowIso = new Date().toISOString();
      if (authUserId) {
        await supabase
          .from("message_deliveries")
          .update({ read_at: nowIso, status: "read" })
          .eq("user_id", authUserId)
          .eq("channel", "in_app")
          .is("read_at", null);
      }
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
        ref={triggerRef}
        type="button"
        className="relative flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls={panelId}
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
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="absolute right-0 mt-2 w-80 max-h-[min(24rem,70vh)] bg-card shadow-lg rounded-xl z-50 border border-border"
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span id={headingId} className="font-semibold text-foreground">Activity</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                  aria-label="Mark all notifications as read"
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
                    <button
                      type="button"
                      onClick={() => {
                        if (!n.read) handleMarkRead(n);
                      }}
                      className="text-sm text-foreground text-left w-full"
                      aria-label={`${n.read ? "Read" : "Unread"} notification: ${n.message}`}
                    >
                      {n.message}
                    </button>
                    <div className="text-xs text-muted-foreground mt-1">{formatTime(n.createdAt)}</div>
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