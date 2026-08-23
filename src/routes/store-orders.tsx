import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Loader2, Package, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import { orderDispatchQuery } from "@/lib/dispatch";
import {
  ORDER_LABELS,
  storeOrdersQuery,
  updateOrderStatus,
  type OrderRow,
  type OrderStatus,
} from "@/lib/orders";
import { myStoresQuery } from "@/lib/stores";

export const Route = createFileRoute("/store-orders")({
  head: () => ({
    meta: [
      { title: "Store orders — RushOrder PH partners" },
      {
        name: "description",
        content:
          "Accept, prepare and hand off incoming RushOrder PH customer orders from your partner dashboard.",
      },
      { property: "og:title", content: "Store orders — RushOrder PH partners" },
      { property: "og:description", content: "Accept and fulfil incoming customer orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StoreOrdersPage,
});

/** Next status a seller can move an order to. */
const NEXT_STATUS: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  pending: { next: "confirmed", label: "Accept order" },
  confirmed: { next: "preparing", label: "Start preparing" },
  preparing: { next: "ready", label: "Mark ready for pickup" },
};
function SellerOrderRow({
  order,
  action,
  advance,
  queryClient,
}: {
  order: OrderRow;
  action: { next: OrderStatus; label: string } | undefined;
  advance: {
    isPending: boolean;
    mutate: (variables: { id: string; status: OrderStatus }) => void;
  };
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const dispatch = useQuery(orderDispatchQuery(order.id));

  const redispatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dispatch_start", {
        _order_id: order.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["dispatch-job", order.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["store-orders"],
        }),
      ]);

      toast.success("Rider search restarted", {
        description: "We're looking for an available rider again.",
      });
    },
    onError: (error) => {
      toast.error("Could not re-dispatch rider", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  const noRiderAvailable = dispatch.data?.status === "failed";

  return (
    <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <Link to="/order/$orderId" params={{ orderId: order.id }} className="group">
          <p className="text-sm font-bold group-hover:underline">
            {order.order_items?.[0]?.product_name ?? `Order #${order.id.slice(0, 8)}`}
            {order.order_items && order.order_items.length > 1
              ? ` + ${order.order_items.length - 1} more`
              : ""}
          </p>
        </Link>

        <p className="text-xs text-muted-foreground">
          {new Date(order.created_at).toISOString().slice(0, 16).replace("T", " ")} ·{" "}
          {ORDER_LABELS[order.status]} · {order.payment_method.toUpperCase()}
        </p>

        {(order.order_items ?? []).length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {(order.order_items ?? [])
              .map((item) =>
                item.quantity > 1 ? `${item.quantity} x ${item.product_name}` : item.product_name,
              )
              .join(", ")}
          </p>
        ) : null}

        {noRiderAvailable ? (
          <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <p className="text-sm font-semibold text-destructive">No available riders</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No rider has accepted this delivery yet.
            </p>

            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={redispatch.isPending || order.status !== "ready"}
              onClick={() => redispatch.mutate()}
            >
              {redispatch.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Finding rider…
                </>
              ) : (
                "Re-dispatch Rider"
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="outline">
          <Link to="/order/$orderId" params={{ orderId: order.id }}>
            Track Order
          </Link>
        </Button>

        <span className="font-display text-lg font-extrabold">{peso(Number(order.total))}</span>

        {order.status === "cancelled" ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
            Cancelled
          </span>
        ) : (
          <>
            {action ? (
              <Button
                size="sm"
                disabled={advance.isPending}
                onClick={() =>
                  advance.mutate({
                    id: order.id,
                    status: action.next,
                  })
                }
              >
                {action.label}
              </Button>
            ) : null}

            {order.status === "pending" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={advance.isPending}
                onClick={() =>
                  advance.mutate({
                    id: order.id,
                    status: "cancelled",
                  })
                }
              >
                Decline
              </Button>
            ) : null}

            {(["confirmed", "preparing", "ready"] as OrderStatus[]).includes(order.status) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={advance.isPending}
                onClick={() =>
                  advance.mutate({
                    id: order.id,
                    status: "cancelled",
                  })
                }
              >
                Cancel order
              </Button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

function StoreOrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/store-orders" }, replace: true });
  }, [loading, user, navigate]);

  const stores = useQuery(myStoresQuery(user?.id));
  const storeIds = (stores.data ?? []).map((s) => s.id);
  const orders = useQuery(storeOrdersQuery(storeIds));
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      updateOrderStatus(id, status),
    onSuccess: () => {
      toast.success("Order updated");
      void queryClient.invalidateQueries({ queryKey: ["store-orders"] });
    },
    onError: (error: Error) =>
      toast.error("Could not update order", { description: error.message }),
  });

  const list = orders.data ?? [];

  return (
    <DashboardLayout
      workspace="Partner workspace"
      items={[
        { to: "/seller", label: "Overview", icon: Store },
        { to: "/my-stores", label: "My stores", icon: Store },
        { to: "/my-products", label: "Products", icon: Package },
        { to: "/store-orders", label: "Orders", icon: ClipboardList },
      ]}
    >
      <PageHeader
        title="Orders"
        description="Accept and fulfil incoming customer orders in real time."
      />

      {stores.isLoading || orders.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading orders…</p>
      ) : list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No orders yet"
          description="New customer orders appear here the moment they are placed."
        />
      ) : (
        <Panel title="Incoming and recent orders">
          <ul className="divide-y divide-border">
            {list.map((order) => (
              <SellerOrderRow
                key={order.id}
                order={order}
                action={NEXT_STATUS[order.status]}
                advance={advance}
                queryClient={queryClient}
              />
            ))}
          </ul>
        </Panel>
      )}
    </DashboardLayout>
  );
}
