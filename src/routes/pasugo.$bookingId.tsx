import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Loader2, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LiveDeliveryMap } from "@/components/maps";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import {
  cancelPasugoBooking,
  pasugoBookingQuery,
  pasugoJobQuery,
} from "@/lib/pasugo";
import { watchAssignedRider } from "@/lib/dispatch";
import { dispatchChatUnreadQuery } from "@/lib/dispatch-chat";

export const Route = createFileRoute("/pasugo/$bookingId")({
  head: () => ({
    meta: [
      { title: "Finding rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content: "Track your standalone Pasugo rider booking in real time.",
      },
    ],
  }),
  component: PasugoTrackingPage,
});

function PasugoTrackingPage() {
  const { bookingId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const booking = useQuery(pasugoBookingQuery(bookingId));
  const job = useQuery({
    ...pasugoJobQuery(bookingId),
    refetchInterval: false,
  });

  const assignedRiderId = job.data?.assigned_rider_id ?? booking.data?.assigned_rider_id ?? null;

  const { data: chatUnread } = useQuery(
    dispatchChatUnreadQuery(bookingId, user?.id),
  );

  const [riderLocation, setRiderLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  /*
   * Pasugo realtime:
   * - booking changes update assignment/status
   * - dispatch job changes update rider assignment/state
   * - chat messages update the unread indicator
   */
  useEffect(() => {
    const channel = supabase
      .channel(`pasugo-tracking-${bookingId}-${user?.id ?? "guest"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_bookings",
          filter: `id=eq.${bookingId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-booking", bookingId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-job", bookingId],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_dispatch_jobs",
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-job", bookingId],
          });
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-booking", bookingId],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pasugo_chat_messages",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const message = payload.new as {
            recipient_id?: string;
          };

          if (message.recipient_id === user?.id && user?.id) {
            void queryClient.invalidateQueries({
              queryKey: ["dispatch-chat-unread", bookingId, user.id],
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, queryClient, user?.id]);

  /*
   * Once a rider is assigned, subscribe to that rider's live GPS position.
   */
  useEffect(() => {
    if (!assignedRiderId) {
      setRiderLocation(null);
      return;
    }

    const sub = watchAssignedRider(assignedRiderId, (location) => {
      setRiderLocation(location);
    });

    return () => {
      void supabase.removeChannel(sub);
    };
  }, [assignedRiderId]);

  const cancel = useMutation({
    mutationFn: () => cancelPasugoBooking(bookingId),
    onSuccess: () => {
      toast.success("Booking cancelled");

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-booking", bookingId],
      });

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-job", bookingId],
      });
    },
    onError: (error: Error) =>
      toast.error("Could not cancel booking", {
        description: error.message,
      }),
  });

  const statusText = useMemo(() => {
    if (!booking.data) return "Loading booking";

    const map: Record<string, string> = {
      requested: "Requested",
      finding_rider: "Finding Rider",
      accepted: "Rider Accepted",
      rider_arriving: "Rider Arriving",
      picked_up: "Item Picked Up",
      on_the_way: "On The Way",
      delivered: "Delivered",
      completed: "Completed",
      cancelled: "Cancelled",
      failed: "No Rider Available",
    };

    return map[booking.data.status] ?? booking.data.status;
  }, [booking.data]);

  const searching =
    booking.data?.status === "requested" ||
    booking.data?.status === "finding_rider" ||
    job.data?.status === "searching";

  const failed =
    booking.data?.status === "failed" ||
    job.data?.status === "failed";

  const assigned =
    Boolean(assignedRiderId) &&
    (
      booking.data?.status === "accepted" ||
      booking.data?.status === "rider_arriving" ||
      booking.data?.status === "picked_up" ||
      booking.data?.status === "on_the_way" ||
      booking.data?.status === "delivered" ||
      job.data?.status === "assigned" ||
      job.data?.status === "picked_up" ||
      job.data?.status === "delivered"
    );

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Pasugo booking
        </p>

        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {statusText}
        </h1>

        <p className="mt-1.5 text-sm text-muted-foreground">
          Booking #{bookingId.slice(0, 8).toUpperCase()}
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Bike className="size-4 text-primary" />
            Pasugo rider
          </h2>

          {searching ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Finding a rider for your booking…
            </p>
          ) : failed ? (
            <div className="mt-3">
              <p className="text-sm font-semibold text-destructive">
                No available riders
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                We couldn't find an available rider for your Pasugo request right now.
              </p>
            </div>
          ) : assigned ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {booking.data?.status === "delivered" || job.data?.status === "delivered"
                ? "Your Pasugo request has been delivered."
                : booking.data?.status === "picked_up" ||
                    booking.data?.status === "on_the_way" ||
                    job.data?.status === "picked_up"
                  ? "Your rider is on the way."
                  : "A rider is assigned and heading to your location."}
            </p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Your Pasugo request is being processed.
            </p>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Your location</dt>
              <dd className="max-w-[65%] text-right font-medium">
                {booking.data?.pickup_address ?? "—"}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Estimated fare</dt>
              <dd className="font-semibold">
                {peso(Number(booking.data?.estimated_fare ?? 0))}
              </dd>
            </div>
          </dl>

          {booking.data?.notes ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Notes: {booking.data.notes}
            </p>
          ) : null}

          {booking.data?.status &&
          !["delivered", "completed", "cancelled"].includes(booking.data.status) ? (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => {
                const confirmed = window.confirm(
                  "Cancel this Pasugo booking? This will cancel the rider dispatch and any active rider offer.",
                );

                if (confirmed) {
                  cancel.mutate();
                }
              }}
              disabled={cancel.isPending}
            >
              {cancel.isPending ? "Cancelling…" : "Cancel Pasugo"}
            </Button>
          ) : null}

          {assignedRiderId &&
          (
            booking.data?.status === "accepted" ||
            booking.data?.status === "rider_arriving" ||
            booking.data?.status === "picked_up" ||
            booking.data?.status === "on_the_way" ||
            booking.data?.status === "delivered" ||
            job.data?.status === "assigned" ||
            job.data?.status === "picked_up" ||
            job.data?.status === "delivered"
          ) ? (
            <div className="relative mt-4 inline-flex">
              <Button asChild variant="outline">
                <Link
                  to="/pasugo-chat/$bookingId"
                  params={{ bookingId }}
                >
                  Chat with rider
                </Link>
              </Button>

              {chatUnread ? (
                <span
                  className="absolute -right-1 -top-1 size-3 rounded-full bg-destructive ring-2 ring-card"
                  aria-label="Unread message"
                />
              ) : null}
            </div>
          ) : null}

          {job.data ? (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <LiveDeliveryMap
                dispatchJob={{
                  pickup_lat: job.data.pickup_lat,
                  pickup_lng: job.data.pickup_lng,
                  dropoff_lat: job.data.dropoff_lat,
                  dropoff_lng: job.data.dropoff_lng,
                  status: job.data.status,
                }}
                riderLocation={riderLocation}
              />
            </div>
          ) : null}
        </section>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/pasugo">New booking</Link>
          </Button>
        </div>
      </main>
    </PublicLayout>
  );
}
