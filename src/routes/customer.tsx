import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Clock3, PackageCheck, ShoppingBag, Store, Wallet } from "lucide-react";
import { useEffect } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cancelOrder, myOrdersQuery } from "@/lib/orders";

export const Route = createFileRoute("/customer")({
  head: () => ({
    meta: [
      { title: "Customer dashboard — RushOrder PH" },
      {
        name: "description",
        content: "Track your RushOrder PH orders, wallet balance and deliveries in one place.",
      },
      { property: "og:title", content: "RushOrder PH customer dashboard" },
      { property: "og:description", content: "Your orders, wallet and deliveries." },
    ],
  }),
  component: CustomerDashboard,
});

function CustomerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { next: "/customer" }, replace: true });
  }, [loading, user, navigate]);

  const { data: orders } = useQuery(myOrdersQuery(user?.id));

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-orders"],
      });
    },
  });

  const recent = (orders ?? []).slice(0, 10);

  const active = recent.filter(
    (o) => !["delivered", "cancelled"].includes(o.status),
  ).length;
  const spent = recent.reduce((sum, o) => sum + Number(o.total ?? 0), 0);

  return (
    <DashboardLayout
      workspace="Customer workspace"
      items={[
        { to: "/customer", label: "Overview", icon: ShoppingBag },
        { to: "/marketplace", label: "Marketplace", icon: Store },
        { to: "/become-seller", label: "Become a seller", icon: Store },
        { to: "/become-rider", label: "Become a rider", icon: Bike },
      ]}
    >
      <PageHeader
        title="Your orders"
        description="Track deliveries, review past purchases and manage your wallet."
        action={
          <Button asChild>
            <Link to="/marketplace">Browse stores</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active orders"
          value={String(active)}
          icon={Clock3}
          hint="Being prepared or in transit"
        />
        <StatCard
          label="Orders placed"
          value={String(recent.length)}
          icon={PackageCheck}
          hint="Last 10 shown below"
        />
        <StatCard label="Total spent" value={`₱${spent.toLocaleString("en-PH")}`} icon={Wallet} />
      </div>

      <Panel title="Recent orders" description="Your latest RushOrder PH activity" className="mt-6">
        {recent.length > 0 ? (
          <ul className="divide-y divide-border">
            {recent.map((order) => (
              <li key={order.id} className="flex items-center justify-between py-3">
                <Link
                  to="/order/$orderId"
                  params={{ orderId: order.id }}
                  className="hover:underline"
                >
                  <p className="text-sm font-semibold">Order #{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString("en-PH")}
                  </p>
                </Link>
                <div className="text-right space-y-2">
                  <p className="text-sm font-bold">
                    ₱{Number(order.total ?? 0).toLocaleString("en-PH")}
                  </p>

                  <p className="text-xs capitalize text-muted-foreground">
                    {order.status.replace(/_/g, " ")}
                  </p>

                  {order.status === "pending" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => cancelMutation.mutate(order.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel Order
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No orders yet"
            description="When you place your first order, it will show up here with live delivery status."
            action={
              <Button asChild>
                <Link to="/">Start shopping</Link>
              </Button>
            }
          />
        )}
      </Panel>
    </DashboardLayout>
  );
}
