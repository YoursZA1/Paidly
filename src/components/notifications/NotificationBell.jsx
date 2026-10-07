import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { subscribePaidlyNotificationsRealtime } from "@/lib/realtime/paidlyRealtimeManager";
import { useAuth } from "@/contexts/AuthContext";
import { getSupabaseErrorMessage } from "@/utils/supabaseErrorUtils";
import { markNotificationRead, markAllNotificationsReadForCurrentUser } from "@/services/ActivityNotificationService";
import { runDedupedAsync } from "@/lib/inflightRequestDedupe";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, CheckCheck } from "lucide-react";
import {
  invoiceNotificationPath,
  messageNotificationPath,
  notificationLookupFromMessage,
  quoteNotificationPath,
  safeNotificationPath,
} from "@shared/notifications/notificationTarget.js";

const REALTIME_REFRESH_DEBOUNCE_MS = 350;

export default function NotificationBell() {
  const { authUserId } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const headingId = useId();
  const realtimeDebounceRef = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;

  const fetchUnreadCount = useCallback(async () => {
    if (!authUserId) {
      setUnreadCount(0);
      return;
    }
    try {
      const [{ count: activityUnreadCount, error: activityUnreadError }, { count: inAppUnreadCount, error: inAppUnreadError }] =
        await runDedupedAsync(`notif-unread:${authUserId}`, () =>
          Promise.all([
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
          ])
        );
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
      let activityQuery = await supabase
        .from("notifications")
        .select("id, message, created_at, read, link")
        .eq("user_id", authUserId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (activityQuery.error && /link/i.test(activityQuery.error.message || "")) {
        activityQuery = await supabase
          .from("notifications")
          .select("id, message, created_at, read")
          .eq("user_id", authUserId)
          .order("created_at", { ascending: false })
          .limit(20);
      }
      const { data, error } = activityQuery;
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
        link: safeNotificationPath(n.link),
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
          link: messageNotificationPath(row.id),
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

  const fetchUnreadCountRef = useRef(fetchUnreadCount);
  fetchUnreadCountRef.current = fetchUnreadCount;
  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;

  useEffect(() => {
    if (!authUserId) return undefined;
    void fetchUnreadCountRef.current();
    const scheduleRefresh = () => {
      if (realtimeDebounceRef.current) {
        window.clearTimeout(realtimeDebounceRef.current);
      }
      realtimeDebounceRef.current = window.setTimeout(() => {
        void fetchUnreadCountRef.current();
        if (openRef.current) void fetchNotificationsRef.current();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };
    const unsub = subscribePaidlyNotificationsRealtime(authUserId, scheduleRefresh);
    return () => {
      if (realtimeDebounceRef.current) {
        window.clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      unsub();
    };
  }, [authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    void fetchUnreadCount();
    if (open) {
      void fetchNotifications();
    }
  }, [authUserId, open, fetchNotifications, fetchUnreadCount]);

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

  const openSource = async (item) => {
    if (!item.read) void handleMarkRead(item);
    const direct = safeNotificationPath(item.link);
    if (direct) {
      setOpen(false);
      navigate(direct);
      return;
    }
    const lookup = notificationLookupFromMessage(item.message);
    if (!lookup) return;
    if (lookup.path) {
      setOpen(false);
      navigate(lookup.path);
      return;
    }
    const table = lookup.kind === "invoice_number" ? "invoices" : "quotes";
    const column = lookup.kind === "invoice_number" ? "invoice_number" : "quote_number";
    const { data, error } = await supabase.from(table).select("id").eq(column, lookup.number).limit(1);
    if (error) {
      console.warn("NotificationBell: source lookup failed", getSupabaseErrorMessage(error, "Lookup failed"));
      return;
    }
    const path =
      lookup.kind === "invoice_number"
        ? invoiceNotificationPath(data?.[0]?.id)
        : quoteNotificationPath(data?.[0]?.id);
    if (!path) return;
    setOpen(false);
    navigate(path);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-11 items-center justify-center rounded-full hover:bg-muted transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card lg:size-10"
          aria-label="Notifications"
        >
          <Bell className="size-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-semibold min-w-[18px] h-[18px] flex items-center justify-center rounded-full">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      {/* Portaled out of the app bar. The bar's slide transform and blur were splitting this panel. */}
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={headingId}
        className="w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border-border bg-card p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border p-3">
          <span id={headingId} className="font-semibold text-foreground">Activity</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              aria-label="Mark all notifications as read"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-[min(24rem,70vh)] overflow-y-auto">
          {fetchError ? (
            <li className="p-4 text-sm text-destructive">{fetchError}</li>
          ) : notifications.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No notifications yet. Activity from invoices and quotes will appear here.</li>
          ) : (
            notifications.map((n) => (
              <li
                key={n.id}
                className={`border-b border-border p-3 last:border-b-0 ${n.read ? "bg-transparent" : "bg-primary/5"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    void openSource(n);
                  }}
                  className="w-full text-left text-sm text-foreground hover:underline"
                  aria-label={`Open notification: ${n.message}`}
                >
                  {n.message}
                </button>
                <div className="mt-1 text-xs text-muted-foreground">{formatTime(n.createdAt)}</div>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}