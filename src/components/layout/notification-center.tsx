import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  notificationsQueryOptions,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api/notifications";
import { toneDotClasses } from "@/components/common/tone";
import { EmptyState } from "@/components/common/empty-state";
import type { NotificationItem } from "@/types";

const SEVERITY_TONE: Record<NotificationItem["severity"], "info" | "warning" | "danger"> = {
  info: "info",
  warning: "warning",
  danger: "danger",
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery(notificationsQueryOptions());
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () => toast.error("Couldn't mark notifications as read. Try again."),
  });
  const markOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: () => toast.error("Couldn't mark the notification as read. Try again."),
  });

  const groups = notifications.reduce<Record<string, NotificationItem[]>>((acc, n) => {
    (acc[n.category] ??= []).push(n);
    return acc;
  }, {});

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            disabled={unreadCount === 0}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <EmptyState title="You're all caught up" className="border-none py-10" />
          ) : (
            Object.entries(groups).map(([category, items]) => (
              <div key={category}>
                <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                {items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markOne.mutate(n.id)}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-accent/60",
                      !n.read && "bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        toneDotClasses[SEVERITY_TONE[n.severity]],
                        n.read && "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{n.detail}</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                        {timeAgo(n.at)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
