import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bike, ChevronLeft, MapPin, Navigation, PackageCheck } from "lucide-react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { useAuth } from "@/contexts/use-auth";
import { peso } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { activeJobQuery, riderHistoryQuery } from "@/lib/dispatch";
import { activePasugoJobForRiderQuery, riderPasugoHistoryQuery } from "@/lib/pasugo";

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
  const { data: activePasugoJob, isLoading: activePasugoLoading } = useQuery(
    activePasugoJobForRiderQuery(riderId),
  );
  const { data: pasugoHistory, isLoading: pasugoHistoryLoading } = useQuery(
    riderPasugoHistoryQuery(riderId),
  );

  const completed = history ?? [];
  const completedPasugo = pasugoHistory ?? [];
  const allHistory = [
    ...completed.map((job) => ({ type: "marketplace" as const, job })),
    ...completedPasugo.map((job) => ({ type: "pasugo" as const, job })),
  ].sort((a, b) => new Date(b.job.updated_at).getTime() - new Date(a.job.updated_at).getTime());

  return (
    <>
      <PageHeader title="My orders" description="View your active and completed deliveries." />

      {activeLoading || activePasugoLoading ? (
        <Panel title="Active deliveries" className="mt-6">
          <p className="py-6 text-sm text-muted-foreground">Loading active deliveries…</p>
        </Panel>
      ) : activeJob || activePasugoJob ? (
        <div className="mt-6 space-y-4">
          {activeJob ? (
            <ActiveDeliveryCard
              title={
                activeJob.dispatch_type === "pasugo" ? "Active Pasugo booking" : "Active delivery"
              }
              type={activeJob.dispatch_type === "pasugo" ? "Pasugo" : "Marketplace"}
              fee={activeJob.delivery_fee}
              distance={activeJob.distance_km}
              status={activeJob.status}
              pickupTitle={
                activeJob.dispatch_type === "pasugo" ? "Pickup" : (activeJob.store_name ?? "Store")
              }
              dropoffTitle={activeJob.dispatch_type === "pasugo" ? "Destination" : "Customer"}
              pickupAddress={activeJob.pickup_address}
              dropoffAddress={activeJob.dropoff_address}
            />
          ) : null}

          {activePasugoJob ? (
            <ActiveDeliveryCard
              title="Active Pasugo booking"
              type="Pasugo"
              fee={activePasugoJob.delivery_fee}
              distance={activePasugoJob.distance_km}
              status={activePasugoJob.status}
              trackingBookingId={activePasugoJob.booking_id}
              pickupTitle="Pickup"
              dropoffTitle="Destination"
              pickupAddress={activePasugoJob.pickup_address}
              dropoffAddress={activePasugoJob.dropoff_address}
            />
          ) : null}
        </div>
      ) : null}

      <Panel
        title="Delivery history"
        description="Your completed Marketplace and Pasugo deliveries."
        className="mt-6"
      >
        {historyLoading || pasugoHistoryLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading delivery history…
          </p>
        ) : allHistory.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="No completed deliveries yet"
            description="Completed deliveries will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {allHistory.map(({ type, job }) => (
              <div key={`${type}-${job.id}`} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">
                        {type === "pasugo"
                          ? "Pasugo delivery"
                          : (job.store_name ?? "Marketplace delivery")}
                      </p>

                      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium capitalize">
                        {job.status.replace("_", " ")}
                      </span>

                      <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                        {type === "pasugo" ? "Pasugo" : "Marketplace"}
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

                    <p className="text-xs text-muted-foreground">
                      {type === "pasugo" ? "Updated" : "Delivered"}{" "}
                      {new Date(job.updated_at).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
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

function ActiveDeliveryCard({
  title,
  type,
  fee,
  distance,
  status,
  trackingBookingId,
  pickupTitle,
  dropoffTitle,
  pickupAddress,
  dropoffAddress,
}: {
  title: string;
  type: "Pasugo" | "Marketplace";
  fee: number;
  distance: number;
  status: string;
  trackingBookingId?: string;
  pickupTitle: string;
  dropoffTitle: string;
  pickupAddress: string | null;
  dropoffAddress: string | null;
}) {
  return (
    <Panel title={title} description="Your current delivery in progress.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="font-display text-2xl font-extrabold">{peso(Number(fee))}</p>

          <p className="text-sm text-muted-foreground">{Number(distance).toFixed(1)} km</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <LocationCard icon={MapPin} label="Pick up" title={pickupTitle} address={pickupAddress} />

          <LocationCard
            icon={Navigation}
            label="Drop off"
            title={dropoffTitle}
            address={dropoffAddress}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-orange-500 bg-orange-500/10 px-3 py-1 text-xs font-bold capitalize text-orange-600">
            {status.replace("_", " ")}
          </span>

          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
            {type}
          </span>

          {trackingBookingId ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/pasugo/$bookingId" params={{ bookingId: trackingBookingId }}>
                View tracking
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
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
