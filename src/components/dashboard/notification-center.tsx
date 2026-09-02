import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatPhilippineDateTime } from "@/lib/date";
import { getNotificationDestination } from "@/lib/notification-routing";

export function NotificationCenter() {
  const { user, primaryRole } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const notifications = useQuery({
    queryKey: ["notifications", "mine", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,kind,is_read,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const unread = (notifications.data ?? []).filter((item) => !item.is_read).length;

  useEffect(() => {
    const updateAppBadge = async () => {
      try {
        if (unread > 0 && "setAppBadge" in navigator) {
          await navigator.setAppBadge(unread);
        } else if (unread === 0 && "clearAppBadge" in navigator) {
          await navigator.clearAppBadge();
        }
      } catch (error) {
        console.debug("Could not update app badge:", error);
      }
    };

    void updateAppBadge();
  }, [unread]);

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId!)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications", "mine"] }),
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications", "mine", userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  if (!userId) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative"
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute left-1/2 top-11 z-50 w-[calc(100vw-2rem)] max-w-96 -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-xl sm:left-auto sm:right-0 sm:w-[min(24rem,calc(100vw-1rem))] sm:max-w-[calc(100vw-1rem)] sm:translate-x-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-bold">Notifications</p>
              <p className="text-xs text-muted-foreground">
                {unread ? `${unread} unread` : "You're all caught up"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!unread || markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="shrink-0 whitespace-nowrap"
            >
              <CheckCheck className="size-4" />
              <span className="hidden sm:inline">Mark all read</span>
            </Button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {notifications.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading notifications…
              </div>
            ) : notifications.data?.length ? (
              notifications.data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.is_read) {
                      markRead.mutate(item.id);
                    }

                    const destination = getNotificationDestination({
                      kind: item.kind,
                      role: primaryRole,
                    });

                    setOpen(false);
                    void navigate({
                      to: destination as never,
                    });
                  }}
                  className={cn(
                    "block w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                    !item.is_read && "bg-primary/5",
                    item.kind === "rider_location_service" && "cursor-pointer",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.is_read ? "bg-muted" : "bg-primary",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{item.title}</p>
                      {item.body ? (
                        <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                          {item.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatPhilippineDateTime(item.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No notifications yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
