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
  expirePasugoSelectedRider,
  pasugoAvailableRidersQuery,
  pasugoBookingQuery,
  pasugoJobQuery,
  selectPasugoRider,
} from "@/lib/pasugo";
import { watchAssignedRider } from "@/lib/dispatch";

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

  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [requestPending, setRequestPending] = useState(false);

  const availableRiders = useQuery({
    ...pasugoAvailableRidersQuery(job.data?.status === "searching" ? job.data.id : undefined),
  });

  const riders = availableRiders.data ?? [];

  const selectRider = useMutation({
    mutationFn: async (riderId: string) => {
      if (!job.data) throw new Error("Pasugo dispatch job is not ready.");

      return selectPasugoRider(job.data.id, riderId);
    },
    onMutate: (riderId) => {
      setSelectedRiderId(riderId);
      setRequestPending(true);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        setSelectedRiderId(null);
        setRequestPending(false);
        toast.error("Could not request rider");
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-available-riders", job.data?.id],
      });

      toast.success("Rider request sent", {
        description: "Waiting for the selected rider to accept your Pasugo request.",
      });
    },
    onError: (error: Error) => {
      setSelectedRiderId(null);
      setRequestPending(false);

      toast.error("Could not select rider", {
        description: error.message,
      });

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-available-riders", job.data?.id],
      });
    },
  });

  const expireSelectedRider = useMutation({
    mutationFn: async () => {
      if (!job.data) throw new Error("Pasugo dispatch job is not ready.");

      return expirePasugoSelectedRider(job.data.id);
    },
    onSuccess: (changed) => {
      if (!changed) return;

      setSelectedRiderId(null);
      setRequestPending(false);

      toast.error("Rider request expired", {
        description: "The rider did not respond. Please choose another available rider.",
      });

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-available-riders", job.data?.id],
      });

      void queryClient.invalidateQueries({
        queryKey: ["pasugo-job", bookingId],
      });
    },
    onError: (error: Error) => {
      toast.error("Could not update rider request", {
        description: error.message,
      });
    },
  });

  useEffect(() => {
    if (!requestPending || !job.data?.expires_at) return;

    const expiresAt = new Date(job.data.expires_at).getTime();

    const checkExpiry = () => {
      if (Date.now() >= expiresAt && !expireSelectedRider.isPending) {
        expireSelectedRider.mutate();
      }
    };

    checkExpiry();

    const timer = window.setInterval(checkExpiry, 1000);

    return () => window.clearInterval(timer);
  }, [requestPending, job.data?.expires_at, expireSelectedRider.isPending]);

  useEffect(() => {
    const channel = supabase
      .channel(`pasugo-offers-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pasugo_dispatch_offers",
          filter: `booking_id=eq.${bookingId}`,
        },
        (payload) => {
          const row = payload.new as {
            rider_id?: string;
            status?: string;
          };

          if (
            requestPending &&
            row.rider_id === selectedRiderId &&
            (row.status === "declined" || row.status === "expired")
          ) {
            const declined = row.status === "declined";

            setSelectedRiderId(null);
            setRequestPending(false);

            toast.error(declined ? "Rider declined" : "Rider request expired", {
              description: declined
                ? "Please choose another available rider."
                : "The rider did not respond. Please choose another available rider.",
            });

            void queryClient.invalidateQueries({
              queryKey: ["pasugo-available-riders", job.data?.id],
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, job.data?.id, queryClient, requestPending, selectedRiderId]);

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
          </dl>

          {booking.data?.status === "finding_rider" ||
          booking.data?.status === "requested" ||
          booking.data?.status === "failed" ? (
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              Cancel booking
            </Button>
          ) : null}

          {job.data?.status === "searching" && !requestPending ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">Choose a rider</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Available online riders are sorted from nearest to farthest from your pickup.
                  </p>
                </div>
                <Bike className="size-5 shrink-0 text-muted-foreground" />
              </div>

              {availableRiders.isLoading ? (
                <div className="mt-5 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Finding available riders...
                </div>
              ) : availableRiders.error ? (
                <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                  <p className="font-medium">Could not load available riders.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => void availableRiders.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : riders.length === 0 ? (
                <div className="mt-5 rounded-lg border border-border bg-background p-5 text-center">
                  <Bike className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 font-medium">No riders available right now</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Please wait for an online rider or try again shortly.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {riders.map((rider) => (
                    <div
                      key={rider.rider_id}
                      className="flex items-center justify-between gap-4 rounded-xl border bg-background p-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Bike className="size-4 shrink-0 text-muted-foreground" />
                          <p className="truncate font-semibold">{rider.rider_name}</p>
                        </div>

                        <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="size-3.5" />
                          <span>{rider.distance_km.toFixed(2)} km away</span>
                        </div>
                      </div>

                      <Button
                        onClick={() => selectRider.mutate(rider.rider_id)}
                        disabled={selectRider.isPending}
                      >
                        {selectRider.isPending && selectRider.variables === rider.rider_id ? (
                          <>
                            <Loader2 className="size-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Choose Rider"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {job.data?.status === "searching" && requestPending ? (
            <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin" />
                <div>
                  <p className="font-semibold">Waiting for rider response</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The selected rider has received your Pasugo request. If the rider rejects it,
                    you can choose another rider.
                  </p>
                </div>
              </div>
            </div>
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
