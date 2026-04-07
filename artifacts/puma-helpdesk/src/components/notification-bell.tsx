import { useCallback } from "react";
import { Link } from "wouter";
import { Bell, CheckCheck, Ticket, UserCheck, MessageCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useNotifications, useSSENotifications, type Notification } from "@/hooks/use-notifications";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeTime } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-600",
  high: "text-orange-500",
  medium: "text-yellow-600",
  low: "text-slate-500",
};

function NotifIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "new_ticket":
      return <Ticket className="h-4 w-4 text-blue-500 shrink-0" />;
    case "ticket_assigned":
      return <UserCheck className="h-4 w-4 text-green-500 shrink-0" />;
    case "comment_added":
      return <MessageCircle className="h-4 w-4 text-purple-500 shrink-0" />;
    default:
      return <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />;
  }
}

function PriorityLabel({ priority }: { priority?: string }) {
  if (!priority) return null;
  const labels: Record<string, string> = {
    critical: "Critique",
    high: "Haute",
    medium: "Moyenne",
    low: "Faible",
  };
  return (
    <span className={`text-[10px] font-bold uppercase ${PRIORITY_COLORS[priority] ?? "text-muted-foreground"}`}>
      {labels[priority] ?? priority}
    </span>
  );
}

export function NotificationBell() {
  const { toast } = useToast();

  const { notifications, unreadCount, markAllRead, markRead, refetch } = useNotifications();

  const TOAST_TITLES: Record<string, string> = {
    new_ticket: "Nouveau ticket",
    ticket_assigned: "Ticket assigné",
    status_changed: "Statut mis à jour",
    comment_added: "Nouveau message",
  };

  useSSENotifications(
    useCallback(
      (event, data: any) => {
        toast({
          title: TOAST_TITLES[event] ?? "Notification",
          description: data.message ?? `Ticket #${data.ticketId}`,
          duration: 7000,
        });
        refetch();
      },
      [toast, refetch],
    ),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground hover:text-foreground">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 max-h-[420px] overflow-hidden flex flex-col p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full font-bold">
                {unreadCount}
              </span>
            )}
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={markAllRead}
            >
              <CheckCheck className="h-3 w-3" />
              Tout lire
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Aucune notification</p>
            </div>
          ) : (
            notifications.slice(0, 20).map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                className={`px-4 py-3 cursor-pointer gap-3 items-start border-b last:border-b-0 focus:bg-muted/50 ${!notif.isRead ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                asChild
              >
                <Link
                  href={notif.ticketId ? `/tickets/${notif.ticketId}` : "#"}
                  onClick={() => !notif.isRead && markRead(notif.id)}
                >
                  <div className="mt-0.5">
                    <NotifIcon type={notif.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${!notif.isRead ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelativeTime(notif.createdAt)}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  )}
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
