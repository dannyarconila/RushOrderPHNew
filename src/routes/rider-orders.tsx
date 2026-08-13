import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, ChevronLeft, MapPin, Navigation, PackageCheck } from "lucide-react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { useAuth } from "@/contexts/use-auth";
import { peso } from "@/lib/currency";
import { activeJobQuery, riderHistoryQuery } from "@/lib/dispatch";

export const Route = createFileRoute("/rider-orders")({
  head: () => ({
    meta: [
      { title: "My orders — Rider — RushOrder PH" },
      {
        name: "description",
        content: "View your active and completed RushOrder PH deliveries.",
      },
    ],
  }),
  component: RiderOrdersPage,
});

function RiderOrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({
        to: "/login",
        search: { next: "/rider-orders" },
        replace: true,
      });
    }
  }, [loading, user, navigate]);

  return (
    <DashboardLayout
      workspace="Rider workspace"
      items={[
        { to: "/rider", label: "Overview", icon: Bike },
        { to: "/rider-orders", label: "My orders", icon: PackageCheck },
      ]}
    >
      <RoleGate kind="rider">
        <RiderOrdersContent riderId={user?.id} />
      </RoleGate>
    </DashboardLayout>
  );
}

function RiderOrdersContent({ riderId }: { riderId?: string }) {
  const { data: activeJob, isLoading: activeLoading } = useQuery(activeJobQuery(riderId));
  const { data: history, isLoading: historyLoading } = useQuery(riderHistoryQuery(riderId));

  const completed = history ?? [];

  return (
    <>
      <PageHeader title="My orders" description="View your active and completed deliveries." />

      {activeLoading ? (
        <Panel title="Active delivery" className="mt-6">
          <p className="py-6 text-sm text-muted-foreground">Loading active delivery…</p>
        </Panel>
      ) : activeJob ? (
        <Panel
          title={activeJob.dispatch_type === "pasugo" ? "Active Pasugo booking" : "Active delivery"}
          description="Your current delivery in progress."
          className="mt-6"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-extrabold">
                {peso(Number(activeJob.delivery_fee))}
              </p>

              <p className="text-sm text-muted-foreground">
                {Number(activeJob.distance_km).toFixed(1)} km ·{" "}
                {activeJob.status === "picked_up" ? "On the way" : "Assigned"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <LocationCard
                icon={MapPin}
                label="Pick up"
                title={
                  activeJob.dispatch_type === "pasugo"
                    ? "Pickup"
                    : (activeJob.store_name ?? "Store")
                }
                address={activeJob.pickup_address}
              />

              <LocationCard
                icon={Navigation}
                label="Drop off"
                title={activeJob.dispatch_type === "pasugo" ? "Destination" : "Customer"}
                address={activeJob.dropoff_address}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize">
                {activeJob.status.replace("_", " ")}
              </span>

              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
                {activeJob.dispatch_type === "pasugo" ? "Pasugo" : "Marketplace"}
              </span>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Delivery history" description="Your completed deliveries." className="mt-6">
        {historyLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading delivery history…
          </p>
        ) : completed.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No completed deliveries yet"
            description="Completed deliveries will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {completed.map((job) => (
              <div key={job.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {job.dispatch_type === "pasugo"
                          ? "Pasugo delivery"
                          : (job.store_name ?? "Marketplace delivery")}
                      </p>

                      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium capitalize">
                        {job.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p>
                        <MapPin className="mr-1 inline size-4" />
                        {job.pickup_address ?? "Pickup address unavailable"}
                      </p>

                      <p>
                        <Navigation className="mr-1 inline size-4" />
                        {job.dropoff_address ?? "Drop-off address unavailable"}
                      </p>
                    </div>

                    {job.delivered_at ? (
                      <p className="text-xs text-muted-foreground">
                        Delivered{" "}
                        {new Date(job.delivered_at).toLocaleString("en-PH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-left sm:text-right">
                    <p className="font-display text-xl font-extrabold">
                      {peso(Number(job.delivery_fee))}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {Number(job.distance_km).toFixed(1)} km
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-6">
        <Link
          to="/rider"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to rider dashboard
        </Link>
      </div>
    </>
  );
}

function LocationCard({
  icon: Icon,
  label,
  title,
  address,
}: {
  icon: typeof MapPin;
  label: string;
  title: string;
  address: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{address ?? "Address unavailable"}</p>
        </div>
      </div>
    </div>
  );
}
