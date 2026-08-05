import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { LiveDeliveryMap } from "@/components/maps";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/marketplace";
import {
  cancelPasugoBooking,
  pasugoBookingQuery,
  pasugoJobQuery,
  retryPasugoDispatch,
} from "@/lib/pasugo";
import { secondsLeft, watchAssignedRider } from "@/lib/dispatch";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const booking = useQuery(pasugoBookingQuery(bookingId));
  const job = useQuery({
    ...pasugoJobQuery(bookingId),
    refetchInterval: false,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`pasugo-booking-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pasugo_bookings", filter: `id=eq.${bookingId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["pasugo-booking", bookingId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_dispatch_jobs",
          filter: `booking_id=eq.${bookingId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: ["pasugo-job", bookingId] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, queryClient]);

  useEffect(() => {
    if (!booking.data) return;
    const mine = user && booking.data.customer_id === user.id;
    if (!mine) return;

    if (booking.data.status === "accepted" && booking.data.assigned_rider_id) {
      navigate({ to: "/pasugo-chat/$bookingId", params: { bookingId }, replace: true });
    }
  }, [booking.data, bookingId, navigate, user]);

  useEffect(() => {
    if (!job.data || job.data.status !== "searching") return;
    const tick = () => {
      if (secondsLeft(job.data?.expires_at) === 0) {
        void retryPasugoDispatch(job.data.id).catch(() => undefined);
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => window.clearInterval(timer);
  }, [job.data]);

  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!job.data?.assigned_rider_id) return;

    const sub = watchAssignedRider(job.data.assigned_rider_id, (location) => {
      setRiderLocation(location);
    });

    return () => {
      void supabase.removeChannel(sub);
    };
  }, [job.data?.assigned_rider_id]);

  const cancel = useMutation({
    mutationFn: () => cancelPasugoBooking(bookingId),
    onSuccess: () => {
      toast.success("Booking cancelled");
      void queryClient.invalidateQueries({ queryKey: ["pasugo-booking", bookingId] });
    },
    onError: (error: Error) =>
      toast.error("Could not cancel booking", { description: error.message }),
  });

  const availableCount = useQuery({
    queryKey: ["pasugo-available-riders", bookingId, job.data?.id ?? null],
    enabled: Boolean(job.data && job.data.status === "searching"),
    queryFn: async () => {
      if (!job.data) return null;
      const { data, error } = await supabase.rpc("pasugo_available_riders_count", {
        _job_id: job.data.id,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    staleTime: 10_000,
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
          {job.data?.status === "searching" ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Finding nearby rider... Attempt {job.data.attempt}/{job.data.max_attempts} within{" "}
              {Number(job.data.radius_km).toFixed(0)} km.
            </p>
          ) : null}

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Pickup</dt>
              <dd className="text-right font-medium">{booking.data?.pickup_address ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Drop-off</dt>
              <dd className="text-right font-medium">{booking.data?.dropoff_address ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Estimated distance</dt>
              <dd className="font-medium">
                {Number(booking.data?.estimated_distance_km ?? 0).toFixed(1)} km
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Estimated fare</dt>
              <dd className="font-semibold">{peso(Number(booking.data?.estimated_fare ?? 0))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Rider platform fee</dt>
              <dd className="font-medium">
                {booking.data?.rider_fee_per_booking != null
                  ? peso(Number(booking.data.rider_fee_per_booking))
                  : "Pending (applied on successful delivery)"}
              </dd>
            </div>
            {availableCount.data != null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Available riders</dt>
                <dd className="font-medium">{availableCount.data}</dd>
              </div>
            ) : null}
          </dl>

          {booking.data?.status === "finding_rider" || booking.data?.status === "requested" ? (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              Cancel booking
            </Button>
          ) : null}

          {job.data ? (
            <div className="mt-5 overflow-hidden rounded-xl border">
              <LiveDeliveryMap dispatchJob={job.data as never} riderLocation={riderLocation} />
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
