import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  Clock3,
  Edit3,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  ReceiptText,
  ShoppingBag,
  Store,
  User2,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { myAddressesQuery, type AddressRow, formatAddress } from "@/lib/addresses";
import { peso } from "@/lib/currency";
import { cancelOrder, myOrdersQuery } from "@/lib/orders";
import { cn } from "@/lib/utils";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  kind: string;
  created_at: string;
};

function customerProfileQuery(userId: string | undefined) {
  return {
    queryKey: ["profile", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

function customerNotificationsQuery(userId: string | undefined) {
  return {
    queryKey: ["notifications", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,is_read,kind,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  };
}

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
  const { data: addresses } = useQuery(myAddressesQuery(user?.id));
  const { data: profile } = useQuery(customerProfileQuery(user?.id));
  const { data: notifications } = useQuery(customerNotificationsQuery(user?.id));

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (error: Error) =>
      toast.error("Could not cancel order", { description: error.message }),
  });

  const recent = useMemo(() => (orders ?? []).slice(0, 12), [orders]);
  const activeOrder = useMemo(
    () => recent.find((order) => !["delivered", "cancelled"].includes(order.status)) ?? null,
    [recent],
  );
  const completedOrders = useMemo(
    () => recent.filter((order) => order.status === "delivered"),
    [recent],
  );
  const cancelledOrders = useMemo(
    () => recent.filter((order) => order.status === "cancelled"),
    [recent],
  );
  const unreadNotifications = useMemo(
    () => (notifications ?? []).filter((notification) => !notification.is_read),
    [notifications],
  );
  const spent = completedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);

  return (
    <DashboardLayout
      workspace="Customer workspace"
      items={[
        { to: "/customer", label: "Overview", icon: ShoppingBag },
        { to: "/marketplace", label: "Marketplace", icon: Store },
        { to: "/checkout", label: "Addresses", icon: MapPin },
      ]}
    >
      <PageHeader
        title="My Dashboard"
        description="Track your active order, review history, manage your addresses and stay on top of notifications."
        action={
          <Button asChild>
            <Link to="/marketplace">Browse stores</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active orders"
          value={String(activeOrder ? 1 : 0)}
          icon={Clock3}
          hint={activeOrder ? "Your latest open order" : "No live orders"}
        />
        <StatCard
          label="Completed orders"
          value={String(completedOrders.length)}
          icon={PackageCheck}
          hint="Delivered orders in history"
        />
        <StatCard
          label="Unread notifications"
          value={String(unreadNotifications.length)}
          icon={Bell}
          hint="Account updates and delivery alerts"
        />
      </div>

      <section className="mt-6">
        {activeOrder ? (
          <Panel
            title="Active order"
            description="Your current order is shown here first, with live tracking below."
          >
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Order number
                </p>
                <p className="mt-1 font-display text-2xl font-extrabold tracking-tight">
                  {activeOrder.claim_number
                    ? activeOrder.claim_number
                    : `Order #${activeOrder.id.slice(0, 8)}`}
                </p>

                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Current status" value={formatStatus(activeOrder.status)} />
                  <InfoRow label="Store name" value={activeOrder.stores?.name ?? "Unknown store"} />
                  <InfoRow label="Order total" value={peso(Number(activeOrder.total ?? 0))} />
                  <InfoRow
                    label="Delivery fee"
                    value={peso(Number(activeOrder.delivery_fee ?? 0))}
                  />
                  <InfoRow label="Estimated arrival" value={estimateArrival(activeOrder)} />
                </dl>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                  Actions
                </p>
                <div className="mt-4 flex flex-col gap-3">
                  <Button asChild>
                    <Link to="/order/$orderId" params={{ orderId: activeOrder.id }}>
                      Track Order <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  {activeOrder.rider_id ? (
                    <Button asChild variant="outline">
                      <Link to="/booking-chat/$orderId" params={{ orderId: activeOrder.id }}>
                        Chat with rider <MessageSquare className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {activeOrder.status === "pending" ? (
                    <Button
                      variant="destructive"
                      onClick={() => cancelMutation.mutate(activeOrder.id)}
                      disabled={cancelMutation.isPending}
                    >
                      Cancel order <XCircle className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Active order" description="Your live delivery appears here first.">
            <EmptyState
              icon={ShoppingBag}
              title="No active orders"
              description="Start shopping to place a new order and track it from this dashboard."
              action={
                <Button asChild>
                  <Link to="/marketplace">Start Shopping</Link>
                </Button>
              }
            />
          </Panel>
        )}
      </section>

      <Panel
        title="Order history"
        description="Completed orders, cancelled orders and invoices"
        className="mt-6"
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <HistoryColumn
            title="Completed Orders"
            icon={PackageCheck}
            orders={completedOrders}
            emptyText="No completed orders yet."
          />
          <HistoryColumn
            title="Cancelled Orders"
            icon={XCircle}
            orders={cancelledOrders}
            emptyText="No cancelled orders."
          />
          <HistoryColumn
            title="Invoices"
            icon={ReceiptText}
            orders={completedOrders}
            emptyText="No invoices available yet."
            showInvoiceAmount
          />
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel
          title="Saved addresses"
          description="Your default and saved delivery locations"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/checkout">Manage Addresses</Link>
            </Button>
          }
        >
          {(addresses ?? []).length > 0 ? (
            <ul className="space-y-3">
              {(addresses ?? []).map((address: AddressRow) => (
                <li key={address.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {address.label ?? "Address"}
                        {address.is_default ? (
                          <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
                            Default
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{formatAddress(address)}</p>
                    </div>
                    <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={MapPin}
              title="No saved addresses"
              description="Add a delivery address so checkout is faster next time."
              action={
                <Button asChild>
                  <Link to="/checkout">Manage Addresses</Link>
                </Button>
              }
            />
          )}
        </Panel>

        <Panel
          title="Profile"
          description="Your basic account information"
          action={
            <Button variant="outline" size="sm" disabled title="Profile editing is coming soon">
              Edit Profile <Edit3 className="size-4" />
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Phone" value={profile?.phone ?? "Add your phone number"} icon={Phone} />
            <InfoRow label="Email" value={user?.email ?? "No email available"} icon={User2} />
            <InfoRow
              label="Full name"
              value={profile?.full_name ?? "Add your display name"}
              icon={User2}
            />
            <InfoRow label="Account type" value="Customer account" icon={Wallet} />
          </div>
        </Panel>
      </div>

      <Panel
        title="Notifications"
        description="Recent updates about your account and orders"
        className="mt-6"
      >
        {(notifications ?? []).length > 0 ? (
          <ul className="space-y-3">
            {notifications!.map((notification) => (
              <li key={notification.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{notification.body ?? ""}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(notification.created_at).toLocaleString("en-PH")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
                      notification.is_read
                        ? "bg-secondary text-muted-foreground"
                        : "bg-primary-soft text-primary",
                    )}
                  >
                    {notification.is_read ? "Read" : "New"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={BellRing}
            title="No notifications yet"
            description="Delivery updates and account notices will appear here."
          />
        )}
      </Panel>
    </DashboardLayout>
  );
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function estimateArrival(order: { status: string; rider_id: string | null }) {
  if (!order.rider_id) {
    return order.status === "pending" ? "Waiting for assignment" : "Searching for a rider";
  }

  switch (order.status) {
    case "pending":
      return "Waiting for store confirmation";
    case "confirmed":
    case "preparing":
      return "Preparing for dispatch";
    case "ready":
      return "Rider assigned";
    case "picked_up":
      return "On the way";
    default:
      return "Track order for live updates";
  }
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold">{value}</p>
        </div>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      </div>
    </div>
  );
}

function HistoryColumn({
  title,
  icon: Icon,
  orders,
  emptyText,
  showInvoiceAmount = false,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  orders: {
    id: string;
    claim_number: string | null;
    created_at: string;
    total: number;
    status: string;
  }[];
  emptyText: string;
  showInvoiceAmount?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-card text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
      </div>
      {orders.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {orders.slice(0, 5).map((order) => (
            <li key={order.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    to="/order/$orderId"
                    params={{ orderId: order.id }}
                    className="text-sm font-semibold hover:underline"
                  >
                    {order.claim_number ? order.claim_number : `Order #${order.id.slice(0, 8)}`}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("en-PH", {
                      dateStyle: "medium",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {showInvoiceAmount
                      ? peso(Number(order.total ?? 0))
                      : formatStatus(order.status)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </div>
  );
}
