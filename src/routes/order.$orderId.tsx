import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bike, CheckCircle2, Circle, Loader2, Package } from "lucide-react";
import { useEffect, useState } from "react";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/marketplace";
import {
  orderDispatchQuery,
  retryDispatch,
  secondsLeft,
  watchDispatchJob,
  watchAssignedRider,
} from "@/lib/dispatch";
import { ORDER_FLOW, ORDER_LABELS, orderItemsQuery, orderQuery } from "@/lib/orders";
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
  const isPasugo = Boolean(order.data?.notes?.startsWith("[PASUGO]"));

  // Live status updates while the customer keeps the page open.
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

  if (order.isLoading) {
    return (
      <PublicLayout>
        <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </PublicLayout>
    );
  }

  if (!order.data) {
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

  const current = order.data.status;
  const cancelled = current === "cancelled";
  const currentIndex = ORDER_FLOW.indexOf(current);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {isPasugo
            ? `Pasugo booking ${order.data.claim_number ?? order.data.id.slice(0, 8)}`
            : `Claim ${order.data.claim_number ?? order.data.id.slice(0, 8)}`}
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          {ORDER_LABELS[current]}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Placed {new Date(order.data.created_at).toLocaleString("en-PH")}
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

        <DispatchPanel orderId={orderId} />

        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <h2 className="flex items-center gap-2 font-display text-base font-bold">
            <Package className="size-4 text-primary" /> {isPasugo ? "Booking details" : "Order details"}
          </h2>
          {isPasugo ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {order.data.notes
                ?.split("\n")
                .filter((line) => !line.startsWith("[PASUGO]"))
                .join(" · ") || "Standalone rider booking"}
            </p>
          ) : (
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
          )}
          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-semibold">{peso(Number(order.data.subtotal))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery fee</dt>
              <dd className="font-semibold">{peso(Number(order.data.delivery_fee))}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-lg font-extrabold">
                {peso(Number(order.data.total))}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Payment: {order.data.payment_method.toUpperCase()} · {order.data.payment_status}
          </p>
        </section>

        <Button asChild variant="outline" className="mt-6">
          <Link to="/customer">Back to my orders</Link>
        </Button>
      </div>
    </PublicLayout>
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
    if (!job || job.status !== "searching") return;
    const tick = () => {
      if (secondsLeft(job.expires_at) === 0) void retryDispatch(job.id).catch(() => undefined);
    };
    const timer = window.setInterval(tick, 3000);
    return () => window.clearInterval(timer);
  }, [job]);

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
          {isPasugo ? "Finding a rider for your booking" : "Finding a rider near the store"} (attempt {job.attempt} of {job.max_attempts}, within{" "}
          {Number(job.radius_km).toFixed(0)} km)…
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
        {Number(job.distance_km).toFixed(1)} km · {isPasugo ? "estimated fare" : "delivery"} {peso(Number(job.delivery_fee))}
      </p>

      {isPasugo && job.customer_notes ? (
        <p className="mt-2 text-xs text-muted-foreground">Notes: {job.customer_notes}</p>
      ) : null}

      {(job.status === "assigned" || job.status === "picked_up" || job.status === "delivered") ? (
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
