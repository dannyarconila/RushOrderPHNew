import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike, ClipboardList, ShoppingBag, Store, Users, Wallet } from "lucide-react";

import { peso } from "@/components/admin/primitives";
import { PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { adminOverviewQuery } from "@/lib/admin/queries";

export const Route = createFileRoute("/internal-admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data, isLoading } = useQuery(adminOverviewQuery());

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Live snapshot of applications, members, orders and money across RushOrder PH."
      />

      {isLoading || !data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading platform metrics…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Pending stores"
              value={String(data.pendingSellerApps)}
              icon={Store}
              hint="Awaiting review"
            />
            <StatCard
              label="Pending riders"
              value={String(data.pendingRiderApps)}
              icon={ClipboardList}
              hint="Awaiting review"
            />
            <StatCard
              label="Active orders"
              value={String(data.activeOrders)}
              icon={ShoppingBag}
              hint="In progress now"
            />
            <StatCard label="Orders today" value={String(data.ordersToday)} icon={ShoppingBag} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <StatCard label="Customers" value={String(data.customers)} icon={Users} />
            <StatCard label="Sellers" value={String(data.sellers)} icon={Store} />
            <StatCard label="Riders" value={String(data.riders)} icon={Bike} />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel
              title="Revenue summary"
              description="Gross order value processed by the platform"
            >
              <dl className="grid gap-4 sm:grid-cols-3">
                <Metric label="Today" value={peso(data.revenueToday)} />
                <Metric label="This month" value={peso(data.revenueMonth)} />
                <Metric label="Commission (month)" value={peso(data.commissionMonth)} />
              </dl>
            </Panel>

            <Panel
              title="Wallet summary"
              description="Seller and rider wallet float held on the platform"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/internal-admin/wallets">Open wallets</Link>
                </Button>
              }
            >
              <dl className="grid gap-4 sm:grid-cols-3">
                <Metric label="Available" value={peso(data.walletBalance)} />
                <Metric label="Pending" value={peso(data.walletPending)} />
                <Metric label="Wallets" value={String(data.walletCount)} />
              </dl>
            </Panel>
          </div>

          <Panel title="Quick actions" className="mt-6">
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link to="/internal-admin/store-applications">Review store applications</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/internal-admin/rider-applications">Review rider applications</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/internal-admin/orders">Monitor orders</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/internal-admin/announcements">Send announcement</Link>
              </Button>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-display text-2xl font-extrabold tracking-tight">{value}</dd>
    </div>
  );
}
