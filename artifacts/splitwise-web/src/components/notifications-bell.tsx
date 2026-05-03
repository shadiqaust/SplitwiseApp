import { Bell, Check } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  type Notification,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function targetPath(n: Notification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  const expenseId = typeof data.expenseId === "string" ? data.expenseId : null;
  const groupId = typeof data.groupId === "string" ? data.groupId : null;
  const paymentId = typeof data.paymentId === "string" ? data.paymentId : null;
  const actorUserId = typeof data.actorUserId === "string" ? data.actorUserId : null;
  if (expenseId) return `/expenses/${expenseId}`;
  if (groupId) return `/groups/${groupId}`;
  if (paymentId && actorUserId) return `/friends/${actorUserId}`;
  return null;
}

export function NotificationsBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data } = useListNotifications(
    { limit: 30 },
    { query: { refetchInterval: 20000, refetchOnWindowFocus: true } },
  );
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const list = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  const refetch = () =>
    qc.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notifications",
    });

  const handleClick = async (n: Notification) => {
    if (!n.readAt) {
      try {
        await markRead.mutateAsync({ notificationId: n.id });
        refetch();
      } catch {
        // best-effort
      }
    }
    const path = targetPath(n);
    if (path) {
      setOpen(false);
      navigate(path);
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAll.mutateAsync();
      refetch();
    } catch {
      // best-effort
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className={cn("relative", className)}
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center px-1">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[92vw] p-0"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-sm">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleMarkAll}
            disabled={unread === 0 || markAll.isPending}
          >
            <Check className="w-3.5 h-3.5 mr-1" /> Mark all read
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-accent transition-colors flex gap-3",
                      !n.readAt && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 w-2 h-2 rounded-full shrink-0",
                        n.readAt ? "bg-transparent" : "bg-primary",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {n.title}
                      </span>
                      <span className="block text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-1">
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
