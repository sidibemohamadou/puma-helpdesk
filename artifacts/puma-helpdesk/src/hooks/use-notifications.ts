import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface Notification {
  id: number;
  userId: number;
  ticketId: number | null;
  type: "new_ticket" | "ticket_assigned" | "status_changed" | "comment_added";
  message: string;
  isRead: boolean;
  createdAt: string;
}

const POLL_INTERVAL = 15000;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function useNotifications(onNewNotification?: (notif: Notification) => void) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const knownIds = useRef<Set<number>>(new Set());
  const isInitialized = useRef(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<Notification[]>("/api/notifications");
      setNotifications(data);
      const unread = data.filter((n) => !n.isRead);
      setUnreadCount(unread.length);

      if (isInitialized.current) {
        for (const notif of unread) {
          if (!knownIds.current.has(notif.id)) {
            knownIds.current.add(notif.id);
            onNewNotification?.(notif);
          }
        }
      } else {
        data.forEach((n) => knownIds.current.add(n.id));
        isInitialized.current = true;
      }
    } catch {
    }
  }, [onNewNotification]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    try {
      await apiFetch("/api/notifications/read-all", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  }, []);

  const markRead = useCallback(async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  }, []);

  return { notifications, unreadCount, markAllRead, markRead, refetch: fetchNotifications };
}

export function useSSENotifications(onEvent: (event: string, data: object) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let retryTimeout: ReturnType<typeof setTimeout>;
    let es: EventSource;

    const connect = () => {
      es = new EventSource("/api/notifications/stream", { withCredentials: true });
      eventSourceRef.current = es;

      const eventTypes = ["new_ticket", "ticket_assigned", "status_changed", "comment_added"];
      eventTypes.forEach((type) => {
        es.addEventListener(type, (evt: MessageEvent) => {
          try {
            const data = JSON.parse(evt.data);
            onEventRef.current(type, data);
          } catch {}
        });
      });

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
      eventSourceRef.current = null;
    };
  }, []);
}
