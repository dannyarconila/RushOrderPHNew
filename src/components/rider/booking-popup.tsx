/**
 * Live marketplace delivery booking popup.
 *
 * Pasugo continues to use its own popup. This component is for normal
 * marketplace dispatch offers.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bike, Clock, MapPin, Navigation, Package, Phone, Store, User, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { peso } from "@/lib/currency";
import { acceptDispatch, declineDispatch, secondsLeft, type OfferWithJob } from "@/lib/dispatch";
import { supabase } from "@/integrations/supabase/client";

type DeliveryDetails = {
  order_id: string;
  claim_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  store_name: string | null;
  store_address: string | null;
  store_phone: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  distance_km: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export function BookingPopup({ data, onClose }: { data: OfferWithJob; onClose: () => void }) {
  const { offer, job } = data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [remaining, setRemaining] = useState(() => secondsLeft(offer.expires_at));

  const isPasugo = job.dispatch_type === "pasugo";

  const details = useQuery({
    queryKey: ["rider-delivery-details", job.order_id],
    enabled: Boolean(job.order_id) && !isPasugo,
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("rider_delivery_details", {
        _order_id: job.order_id,
      });

      if (error) throw error;
      return result as unknown as DeliveryDetails;
    },
  });

  useEffect(() => {
    setRemaining(secondsLeft(offer.expires_at));

    const timer = window.setInterval(() => {
      const next = secondsLeft(offer.expires_at);
      setRemaining(next);

      if (next <= 0) {
        window.clearInterval(timer);
        onClose();
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [offer.expires_at, onClose]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["dispatch-offer"] });
    void queryClient.invalidateQueries({
      queryKey: ["dispatch-active-job"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rider-status"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rider-delivery-details"],
    });
  };

  const accept = useMutation({
    mutationFn: () => acceptDispatch(job.id),
    onSuccess: (result) => {
      refresh();

      if (!result.ok) {
        toast.error(result.reason ?? "This booking is no longer available.");
        onClose();
        return;
      }

      toast.success("Delivery accepted.");

      navigate({
        to: "/booking-chat/$orderId",
        params: { orderId: job.order_id },
      });

      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decline = useMutation({
    mutationFn: () => declineDispatch(job.id),
    onSuccess: () => {
      refresh();
      toast.info("Booking declined.");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const d = details.data;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Bike className="size-5 text-primary" />
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                Incoming delivery
              </p>
              <h2 className="font-extrabold">
                {d?.claim_number ?? job.store_name ?? "RushOrder delivery"}
              </h2>
            </div>
          </div>

          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Delivery earnings
              </p>
              <p className="text-2xl font-black text-primary">{peso(Number(job.delivery_fee))}</p>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-sm font-bold">
                <Clock className="size-4" />
                {remaining}s
              </div>
              <p className="text-xs text-muted-foreground">
                {d?.distance_km != null
                  ? `${Number(d.distance_km).toFixed(2)} km`
                  : "Distance unavailable"}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <Store className="size-5 text-primary" />
              <p className="font-bold">Pickup from seller</p>
            </div>

            <p className="font-bold">{d?.store_name ?? job.store_name ?? "Store"}</p>

            <p className="mt-1 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <MapPin className="mt-1 size-4 shrink-0" />
              {d?.pickup_address ??
                d?.store_address ??
                job.pickup_address ??
                "Pickup address unavailable"}
            </p>

            {d?.store_phone ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="size-4" />
                {d.store_phone}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <User className="size-5 text-primary" />
              <p className="font-bold">Customer / drop-off</p>
            </div>

            <p className="font-bold">{d?.customer_name ?? "Customer"}</p>

            {d?.customer_phone ? (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="size-4" />
                {d.customer_phone}
              </p>
            ) : null}

            <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <Navigation className="mt-1 size-4 shrink-0" />
              {d?.dropoff_address ??
                d?.customer_address ??
                job.dropoff_address ??
                "Drop-off address unavailable"}
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <Package className="size-5 text-primary" />
              <p className="font-bold">Order</p>
            </div>

            {details.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading order details…</p>
            ) : details.isError ? (
              <div className="space-y-1 text-sm text-destructive">
                <p>Could not load the order details.</p>
                <p className="break-all font-mono text-xs">
                  {details.error instanceof Error
                    ? details.error.message
                    : String(details.error)}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(d?.items ?? []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                  >
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                    </div>
                    <p className="font-semibold">{peso(Number(item.line_total))}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="h-12 flex-1 font-bold"
              disabled={accept.isPending || decline.isPending}
              onClick={() => decline.mutate()}
            >
              Decline
            </Button>

            <Button
              className="h-12 flex-1 font-bold"
              disabled={accept.isPending || decline.isPending}
              onClick={() => accept.mutate()}
            >
              {accept.isPending ? "Accepting…" : "Accept delivery"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
