import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bike, CheckCircle2, Circle, Loader2, Package, Star, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import { orderDispatchQuery, watchAssignedRider, watchDispatchJob } from "@/lib/dispatch";
import { ORDER_FLOW, ORDER_LABELS, orderItemsQuery, orderQuery } from "@/lib/orders";
import {
  cancelPasugoBooking,
  pasugoBookingQuery,
  pasugoJobQuery,
  retryPasugoDispatch,
} from "@/lib/pasugo";
import { cn } from "@/lib/utils";
import { LiveDeliveryMap } from "@/components/maps";

export const Route = createFileRoute("/order/$orderId")({
  head: () => ({
    meta: [
      { title: "Track your order — RushOrder PH" },
      {
        name: "description",
        content:
          "Follow your RushOrder PH delivery live, from store confirmation and preparation to rider pickup and hand-off.",
      },
      { property: "og:title", content: "Track your order — RushOrder PH" },
      {
        property: "og:description",
        content: "Follow your RushOrder PH delivery live from the store to your door.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderTrackingPage,
});

function OrderTrackingPage() {
  const { orderId } = Route.useParams();
  const queryClient = useQueryClient();

  const order = useQuery(orderQuery(orderId));
  const items = useQuery(orderItemsQuery(orderId));

  // Pasugo uses the booking ID as the tracking route ID.
  // Marketplace continues to use the order ID.
  const pasugo = useQuery({
    ...pasugoBookingQuery(orderId),
    enabled: !order.isLoading && !order.data,
  });

  const pasugoJob = useQuery({
    ...pasugoJobQuery(orderId),
    enabled: Boolean(pasugo.data),
  });

  const isPasugo = Boolean(!order.data && pasugo.data);
  const cancelMutation = useMutation({
    mutationFn: () => cancelPasugoBooking(orderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pasugo-booking", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["pasugo-job", orderId] }),
        queryClient.invalidateQueries({ queryKey: ["pasugo-customer-latest"] }),
        queryClient.invalidateQueries({ queryKey: ["pasugo-customer-list"] }),
      ]);

      toast.success("Pasugo request cancelled");
    },
    onError: (error) => {
      toast.error("Could not cancel Pasugo request", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  // Live marketplace order updates.
  useEffect(() => {
    const channel = supabase
      .channel(`order-${orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => void queryClient.invalidateQueries({ queryKey: ["order", orderId] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  // Live Pasugo booking + dispatch updates.
  useEffect(() => {
    if (!isPasugo) return;

    const bookingChannel = supabase
      .channel(`pasugo-booking-tracking-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pasugo_bookings",
          filter: `id=eq.${orderId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-booking", orderId],
          });
        },
      )
      .subscribe();

    const jobChannel = supabase
      .channel(`pasugo-job-tracking-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_dispatch_jobs",
          filter: `booking_id=eq.${orderId}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["pasugo-job", orderId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(bookingChannel);
      void supabase.removeChannel(jobChannel);
    };
  }, [isPasugo, orderId, queryClient]);

  if (order.isLoading || (!order.data && pasugo.isLoading)) {
    return (
      <PublicLayout>
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (!order.data && !pasugo.data) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Order not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This order doesn't exist or you don't have access to it.
          </p>
          <Button asChild className="mt-6">
            <Link to="/customer">Go to my orders</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // ------------------------------------------------------------
  // PASUGO TRACKING
  // ------------------------------------------------------------
  if (isPasugo && pasugo.data) {
    const booking = pasugo.data;
    const job = pasugoJob.data;

    const pasugoFlow = [
      "requested",
      "finding_rider",
      "accepted",
      "rider_arriving",
      "picked_up",
      "on_the_way",
      "delivered",
      "completed",
    ] as const;

    const pasugoLabels: Record<(typeof pasugoFlow)[number], string> = {
      requested: "Request submitted",
      finding_rider: "Finding a rider",
      accepted: "Rider accepted",
      rider_arriving: "Rider arriving",
      picked_up: "Picked up",
      on_the_way: "On the way",
      delivered: "Delivered",
      completed: "Completed",
    };

    const currentIndex = pasugoFlow.indexOf(booking.status as (typeof pasugoFlow)[number]);

    const cancelled = booking.status === "cancelled";
    const failed = booking.status === "failed";

    const canCancel = booking.status === "requested" || booking.status === "finding_rider";

    async function handleCancel() {
      if (!canCancel || cancelMutation.isPending) return;

      const confirmed = window.confirm(
        "Cancel this Pasugo request? This will close the current request.",
      );

      if (!confirmed) return;

      cancelMutation.mutate();
    }

    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Pasugo booking {booking.id.slice(0, 8)}
          </p>

          <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {cancelled
              ? "Request cancelled"
              : failed
                ? "Finding a rider"
                : (pasugoLabels[booking.status as (typeof pasugoFlow)[number]] ?? "Pasugo request")}
          </h1>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Requested {new Date(booking.created_at).toLocaleString("en-PH")}
          </p>

          <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            {cancelled ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <XCircle className="size-5" />
                This Pasugo request was cancelled.
              </p>
            ) : failed ? (
              <p className="text-sm font-semibold text-destructive">
                No rider is currently available. We will continue retrying based on dispatch
                settings.
              </p>
            ) : (
              <ol className="flex flex-col gap-4">
                {pasugoFlow.map((status, index) => {
                  const done = currentIndex >= index;

                  return (
                    <li key={status} className="flex items-center gap-3">
                      {done ? (
                        <CheckCircle2 className="size-5 text-success" />
                      ) : (
                        <Circle className="size-5 text-muted-foreground/40" />
                      )}

                      <span
                        className={cn(
                          "text-sm",
                          done ? "font-semibold text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {pasugoLabels[status]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {job && pasugoJob.data ? (
            <PasugoTrackingPanel
              booking={pasugo.data}
              job={pasugoJob.data}
              queryClient={queryClient}
              cancelMutation={cancelMutation}
            />
          ) : (
            <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <Bike className="size-4 text-primary" />
                Pasugo rider
              </h2>

              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Preparing rider dispatch…
              </p>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <Package className="size-4 text-primary" />
              Booking details
            </h2>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pickup
                </dt>
                <dd className="mt-1">{booking.pickup_address}</dd>
              </div>

              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Drop-off
                </dt>
                <dd className="mt-1">{booking.dropoff_address}</dd>
              </div>

              {booking.notes ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </dt>
                  <dd className="mt-1 text-muted-foreground">{booking.notes}</dd>
                </div>
              ) : null}
            </dl>

            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Estimated distance</dt>
                <dd className="font-semibold">
                  {Number(booking.estimated_distance_km).toFixed(1)} km
                </dd>
              </div>

              <div className="flex justify-between border-t border-border pt-2">
                <dt className="font-bold">Estimated fare</dt>
                <dd className="font-display text-lg font-extrabold">
                  {peso(Number(booking.estimated_fare))}
                </dd>
              </div>
            </dl>
          </section>

          {canCancel ? (
            <Button
              type="button"
              variant="destructive"
              className="mt-6 w-full"
              disabled={cancelMutation.isPending}
              onClick={handleCancel}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Cancel Pasugo Request
            </Button>
          ) : null}

          <Button asChild variant="outline" className="mt-4 w-full">
            <Link to="/customer">Back to my orders</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // ------------------------------------------------------------
  // EXISTING MARKETPLACE TRACKING
  // ------------------------------------------------------------
  if (!order.data) {
    return null;
  }

  const marketplaceOrder = order.data;
  const current = marketplaceOrder.status;
  const cancelled = current === "cancelled";
  const currentIndex = ORDER_FLOW.indexOf(current);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {marketplaceOrder.notes?.startsWith("[PASUGO]")
            ? `Pasugo booking ${marketplaceOrder.claim_number ?? marketplaceOrder.id.slice(0, 8)}`
            : `Claim ${marketplaceOrder.claim_number ?? marketplaceOrder.id.slice(0, 8)}`}
        </p>

        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {ORDER_LABELS[current]}
        </h1>

        <p className="mt-1.5 text-sm text-muted-foreground">
          Placed {new Date(marketplaceOrder.created_at).toLocaleString("en-PH")}
        </p>

        <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          {cancelled ? (
            <p className="text-sm font-semibold text-destructive">This order was cancelled.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {ORDER_FLOW.map((status, index) => {
                const done = index <= currentIndex;

                return (
                  <li key={status} className="flex items-center gap-3">
                    {done ? (
                      <CheckCircle2 className="size-5 text-success" />
                    ) : (
                      <Circle className="size-5 text-muted-foreground/40" />
                    )}

                    <span
                      className={cn(
                        "text-sm",
                        done ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {ORDER_LABELS[status]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {!cancelled ? <DispatchPanel orderId={orderId} /> : null}

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Package className="size-4 text-primary" />
            Order details
          </h2>

          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {(items.data ?? []).map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-muted-foreground">
                  {item.quantity} × {item.product_name}
                </span>
                <span className="font-semibold">
                  {peso(Number(item.unit_price) * item.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-semibold">{peso(Number(marketplaceOrder.subtotal))}</dd>
            </div>

            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery fee</dt>
              <dd className="font-semibold">{peso(Number(marketplaceOrder.delivery_fee))}</dd>
            </div>

            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-lg font-extrabold">
                {peso(Number(marketplaceOrder.total))}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-xs text-muted-foreground">
            Payment: {marketplaceOrder.payment_method.toUpperCase()} ·{" "}
            {marketplaceOrder.payment_status}
          </p>
        </section>

        {marketplaceOrder.status === "delivered" ? (
          <OrderReview orderId={orderId} storeId={marketplaceOrder.store_id} />
        ) : null}

        <Button asChild variant="outline" className="mt-6">
          <Link to="/customer">Back to my orders</Link>
        </Button>
      </div>
    </PublicLayout>
  );
}

function PasugoTrackingPanel({
  booking,
  job,
  queryClient,
  cancelMutation,
}: {
  booking: import("@/lib/pasugo").PasugoBooking;
  job: import("@/lib/pasugo").PasugoDispatchJob;
  queryClient: ReturnType<typeof useQueryClient>;
  cancelMutation: {
    mutate: () => void;
    isPending: boolean;
  };
}) {
  const [riderLocation, setRiderLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    if (!job.assigned_rider_id) {
      setRiderLocation(null);
      return;
    }

    const sub = watchAssignedRider(job.assigned_rider_id, (location) => {
      setRiderLocation(location);
    });

    return () => {
      void supabase.removeChannel(sub);
    };
  }, [job.assigned_rider_id]);

  const searching =
    job.status === "searching" ||
    booking.status === "finding_rider" ||
    booking.status === "requested";

  const failed = job.status === "failed";

  const assigned =
    job.status === "assigned" || job.status === "picked_up" || job.status === "delivered";

  const retryMutation = useMutation({
    mutationFn: () => retryPasugoDispatch(job.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pasugo-job", booking.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["pasugo-booking", booking.id],
        }),
      ]);

      toast.success("Rider search restarted", {
        description: "We're looking for an available rider again.",
      });
    },
    onError: (error) => {
      toast.error("Could not restart rider search", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  return (
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
          <p className="text-sm font-semibold text-destructive">No available riders</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We couldn't find an available rider for your Pasugo request right now.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => retryMutation.mutate()}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </>
              ) : (
                "Try Again"
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                "Cancel Request"
              )}
            </Button>
          </div>
        </div>
      ) : assigned ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {job.status === "delivered"
            ? "Your Pasugo request has been delivered."
            : job.status === "picked_up"
              ? "Your rider is on the way to the destination."
              : "A rider is assigned and heading to the pickup point."}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Your Pasugo request is being processed.
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {Number(job.distance_km).toFixed(1)} km · estimated fare {peso(Number(job.delivery_fee))}
      </p>

      {booking.notes ? (
        <p className="mt-2 text-xs text-muted-foreground">Notes: {booking.notes}</p>
      ) : null}

      {job.assigned_rider_id &&
      (job.status === "assigned" || job.status === "picked_up" || job.status === "delivered") ? (
        <Button asChild variant="outline" className="mt-4">
          <Link to="/booking-chat/$orderId" params={{ orderId: job.id }}>
            Chat with rider
          </Link>
        </Button>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border">
        <LiveDeliveryMap dispatchJob={job} riderLocation={riderLocation} />
      </div>
    </section>
  );
}

/**
 * Live rider dispatch state for this order. While the search is running the
 * customer's open tab also nudges the server to retry expired broadcasts.
 */
function DispatchPanel({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();

  const { data: job } = useQuery({
    ...orderDispatchQuery(orderId),
    refetchInterval: false,
  });

  const [riderLocation, setRiderLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  useEffect(() => {
    const sub = watchDispatchJob(orderId, () => {
      queryClient.invalidateQueries({
        queryKey: ["dispatch-job", orderId],
      });
    });

    return () => {
      // Use supabase.removeChannel to reliably remove the realtime channel instance
      void supabase.removeChannel(sub);
    };
  }, [orderId, queryClient]);

  useEffect(() => {
    if (!job?.assigned_rider_id) return;

    const sub = watchAssignedRider(job.assigned_rider_id, (location) => {
      setRiderLocation(location);
    });

    return () => {
      // Use supabase.removeChannel to reliably remove the realtime channel instance
      void supabase.removeChannel(sub);
    };
  }, [job?.assigned_rider_id]);

  if (!job) return null;

  const searching = job.status === "searching";
  const failed = job.status === "failed";
  const isPasugo = job.dispatch_type === "pasugo";

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <h2 className="flex items-center gap-2 font-display text-base font-bold">
        <Bike className="size-4 text-primary" /> {isPasugo ? "Pasugo rider" : "Rider"}
      </h2>
      {searching ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {isPasugo ? "Finding a rider for your booking" : "Finding a rider near the store"}{" "}
          (attempt {job.attempt} of {job.max_attempts}, within {Number(job.radius_km).toFixed(0)}{" "}
          km)…
        </p>
      ) : failed ? (
        <p className="mt-3 text-sm text-destructive">
          {isPasugo
            ? "No rider was available for your booking yet. We will keep retrying based on dispatch settings."
            : "No rider was available. The store will re-dispatch your order shortly."}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {job.status === "delivered"
            ? "Delivered by your rider."
            : job.status === "picked_up"
              ? isPasugo
                ? "Your rider is on the way to the destination."
                : "Your rider has your order and is on the way."
              : isPasugo
                ? "A rider is assigned and heading to the pickup point."
                : "A rider is assigned and heading to the store."}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {Number(job.distance_km).toFixed(1)} km · {isPasugo ? "estimated fare" : "delivery"}{" "}
        {peso(Number(job.delivery_fee))}
      </p>

      {isPasugo && job.customer_notes ? (
        <p className="mt-2 text-xs text-muted-foreground">Notes: {job.customer_notes}</p>
      ) : null}

      {job.status === "assigned" || job.status === "picked_up" || job.status === "delivered" ? (
        <Button asChild variant="outline" className="mt-4">
          <Link to="/booking-chat/$orderId" params={{ orderId }}>
            Chat with rider
          </Link>
        </Button>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border">
        <LiveDeliveryMap dispatchJob={job} riderLocation={riderLocation} />
      </div>
    </section>
  );
}

function OrderReview({ orderId, storeId }: { orderId: string; storeId: string | null }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const existing = useQuery({
    queryKey: ["review", orderId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,rating,comment")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function submit() {
    if (!storeId || existing.data) return;
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setSaving(false);
      toast.error("Please sign in to review this order.");
      return;
    }

    const { error } = await supabase.from("reviews").insert({
      user_id: userId,
      order_id: orderId,
      store_id: storeId,
      rating,
      comment: comment.trim() || null,
    } as never);
    setSaving(false);
    if (error) {
      toast.error("Could not submit review", { description: error.message });
      return;
    }
    toast.success("Thanks for your review!");
    await queryClient.invalidateQueries({ queryKey: ["review", orderId] });
    await queryClient.invalidateQueries({ queryKey: ["store"] });
    await queryClient.invalidateQueries({ queryKey: ["stores"] });
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <h2 className="flex items-center gap-2 font-display text-base font-bold">
        <Star className="size-4 text-primary" /> Review your order
      </h2>
      {existing.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Checking your review…</p>
      ) : existing.data ? (
        <div className="mt-4">
          <div className="flex gap-1" aria-label={`${existing.data.rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={`size-5 ${index < existing.data!.rating ? "fill-current text-primary" : "text-muted-foreground/30"}`}
              />
            ))}
          </div>
          {existing.data.comment ? (
            <p className="mt-3 text-sm text-muted-foreground">{existing.data.comment}</p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">You already reviewed this order.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Your rating</p>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: 5 }, (_, index) => {
                const value = index + 1;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${value} star${value > 1 ? "s" : ""}`}
                    onClick={() => setRating(value)}
                    className="rounded-md p-1 hover:bg-muted"
                  >
                    <Star
                      className={`size-6 ${value <= rating ? "fill-current text-primary" : "text-muted-foreground/30"}`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Tell the store how your order went (optional)"
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} Submit review
          </Button>
        </div>
      )}
    </section>
  );
}
