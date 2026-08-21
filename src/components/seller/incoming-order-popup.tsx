import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Package, Phone, Store, User, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import { transitionOrderStatus } from "@/lib/orders";

type SellerOrderDetails = {
  order_id: string;
  claim_number: string | null;
  status: string;
  payment_method: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  store_name: string | null;
  store_address:
    | string
    | {
        line1?: string | null;
        line2?: string | null;
        barangay?: string | null;
        city?: string | null;
        province?: string | null;
        postal_code?: string | null;
      }
    | null;
  store_phone: string | null;
  subtotal: number;
  delivery_fee: number;
  surge_fee: number;
  tax: number;
  total: number;
  distance_km: number | null;
  notes: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
};

export function IncomingOrderPopup({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();

  const details = useQuery({
    queryKey: ["seller-order-details", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("seller_order_details", {
        _order_id: orderId,
      });

      if (error) throw error;
      return data as unknown as SellerOrderDetails;
    },
  });

  const advance = useMutation({
    mutationFn: (status: "confirmed" | "cancelled") => transitionOrderStatus(orderId, status),

    onSuccess: async (_, status) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["store-orders"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["seller-order-details", orderId],
        }),
      ]);

      if (status === "confirmed") {
        toast.success("Order accepted", {
          description: "You can now start preparing the order.",
        });
      } else {
        toast.info("Order declined.");
      }

      onClose();
    },

    onError: (error: Error) => {
      toast.error("Could not update order", {
        description: error.message,
      });
    },
  });

  const d = details.data;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <p className="text-lg font-extrabold">New incoming order</p>
            <p className="text-xs text-muted-foreground">
              Review the delivery details before accepting.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={advance.isPending}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>

        {details.isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading order details…
          </div>
        ) : details.isError || !d ? (
          <div className="px-5 py-12 text-center">
            <p className="font-semibold">Could not load order details.</p>

            <Button className="mt-4" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 p-5">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Order
                    </p>

                    <p className="mt-1 font-bold">
                      {d.claim_number ?? `#${d.order_id.slice(0, 8)}`}
                    </p>
                  </div>

                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    {d.payment_method.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Package className="size-5 text-primary" />
                  <h3 className="font-bold">Ordered items</h3>
                </div>

                <div className="space-y-2">
                  {d.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold">{item.product_name}</p>

                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {peso(Number(item.unit_price))}
                        </p>
                      </div>

                      <span className="shrink-0 font-bold">{peso(Number(item.line_total))}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <User className="size-5 text-primary" />
                    <h3 className="font-bold">Customer</h3>
                  </div>

                  <p className="text-sm font-semibold">{d.customer_name}</p>

                  {d.customer_phone ? (
                    <a
                      href={`tel:${d.customer_phone}`}
                      className="mt-1 flex items-center gap-1 text-sm text-primary"
                    >
                      <Phone className="size-3.5" />
                      {d.customer_phone}
                    </a>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-border p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Store className="size-5 text-primary" />
                    <h3 className="font-bold">Store</h3>
                  </div>

                  <p className="text-sm font-semibold">{d.store_name ?? "Your store"}</p>

                  {d.store_address ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeof d.store_address === "string"
                        ? d.store_address
                        : [
                            d.store_address.line1,
                            d.store_address.line2,
                            d.store_address.barangay,
                            d.store_address.city,
                            d.store_address.province,
                            d.store_address.postal_code,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <MapPin className="size-5 text-primary" />
                  <h3 className="font-bold">Delivery address</h3>
                </div>

                <p className="text-sm">{d.customer_address ?? "No delivery address available"}</p>

                {d.distance_km != null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Approx. delivery distance: {Number(d.distance_km).toFixed(2)} km
                  </p>
                ) : null}
              </div>

              {d.notes ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Customer notes
                  </p>

                  <p className="mt-1 text-sm">{d.notes}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{peso(Number(d.subtotal))}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery fee</span>
                    <span>{peso(Number(d.delivery_fee))}</span>
                  </div>

                  {Number(d.surge_fee) > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Surge fee</span>
                      <span>{peso(Number(d.surge_fee))}</span>
                    </div>
                  ) : null}

                  {Number(d.tax) > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{peso(Number(d.tax))}</span>
                    </div>
                  ) : null}

                  <div className="flex justify-between border-t border-border pt-3 text-base font-extrabold">
                    <span>Total</span>
                    <span>{peso(Number(d.total))}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex gap-3 border-t border-border bg-card p-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={advance.isPending}
                onClick={() => advance.mutate("cancelled")}
              >
                Decline
              </Button>

              <Button
                type="button"
                className="flex-1"
                disabled={advance.isPending}
                onClick={() => advance.mutate("confirmed")}
              >
                {advance.isPending ? "Updating…" : "Accept order"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
