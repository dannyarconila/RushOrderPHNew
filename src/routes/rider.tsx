import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bike,
  MapPin,
  Navigation,
  PackageCheck,
  Power,
  Route as RouteIcon,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { BookingPopup } from "@/components/rider/booking-popup";
import { PasugoBookingPopup } from "@/components/rider/pasugo-booking-popup";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import {
  activeJobQuery,
  advanceDispatch,
  type DispatchJob,
  pendingOfferQuery,
  riderHistoryQuery,
  riderStatusQuery,
  setRiderPresence,
  watchRiderLocation,
  stopWatchingLocation,
} from "@/lib/dispatch";
import { activePasugoJobForRiderQuery, riderPendingPasugoOfferQuery } from "@/lib/pasugo";
import { minimumWalletBalanceQuery, myWalletQuery } from "@/lib/wallet";
import { getCurrentLocation } from "@/lib/geolocation";

export const Route = createFileRoute("/rider")({
  head: () => ({
    meta: [
      { title: "Rider dashboard — RushOrder PH" },
      {
        name: "description",
        content: "Go online, accept live delivery bookings and track your RushOrder PH earnings.",
      },
      { property: "og:title", content: "RushOrder PH rider dashboard" },
      { property: "og:description", content: "Live bookings, deliveries and earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiderDashboard,
});

function RiderDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch() as Record<string, unknown>;

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { next: "/rider" }, replace: true });
  }, [loading, user, navigate]);

  return (
    <DashboardLayout
      workspace="Rider workspace"
      items={[
        { to: "/rider", label: "Overview", icon: Bike },
        { to: "/rider-orders", label: "My orders", icon: PackageCheck },
        { to: "/rider-wallet", label: "Wallet", icon: Wallet },
      ]}
    >
      <PageHeader
        title="Rider overview"
        description="Go online to receive live booking requests near you."
      />
      <RoleGate kind="rider">
        <RiderOverview
          debugDispatch={search.debugDispatch === "1" || search.debugDispatch === true}
        />
      </RoleGate>
    </DashboardLayout>
  );
}

function RiderOverview({ debugDispatch = false }: { debugDispatch?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissedOffer, setDismissedOffer] = useState<string | null>(null);

  const { data: wallet } = useQuery(myWalletQuery(user?.id, "rider"));
  const { data: minimumBalance } = useQuery(minimumWalletBalanceQuery("rider"));
  const { data: status } = useQuery(riderStatusQuery(user?.id));
  const { data: history } = useQuery(riderHistoryQuery(user?.id));
  const { data: activeJob } = useQuery(activeJobQuery(user?.id));
  const { data: activePasugoJob } = useQuery(activePasugoJobForRiderQuery(user?.id));

  const online = Boolean(status?.is_online);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`rider-status-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rider_status",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["rider-status", user.id],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const { data: offer } = useQuery({
    ...pendingOfferQuery(user?.id),
    enabled: Boolean(user) && online && !activeJob && !activePasugoJob,
    refetchInterval: online && !activeJob && !activePasugoJob ? 5000 : false,
  });

  const { data: pasugoOffer } = useQuery({
    ...riderPendingPasugoOfferQuery(user?.id),
    enabled: Boolean(user) && online && !activeJob && !activePasugoJob,
    refetchInterval: online && !activeJob && !activePasugoJob ? 3000 : false,
  });

  const { data: application } = useQuery({
    queryKey: ["rider-application", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("rider_applications")
        .select("id, status, created_at, review_notes, vehicle_info")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const refreshDispatch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["dispatch-offer"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch-active-job"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch-history"] });
    void queryClient.invalidateQueries({ queryKey: ["rider-status"] });

    void queryClient.invalidateQueries({ queryKey: ["pasugo-offer"] });
    void queryClient.invalidateQueries({ queryKey: ["pasugo-active-job"] });
  }, [queryClient]);

  // Live booking requests and assignment changes for this rider.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`rider-dispatch-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatch_offers",
          filter: `rider_id=eq.${user.id}`,
        },
        refreshDispatch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dispatch_jobs",
          filter: `assigned_rider_id=eq.${user.id}`,
        },
        refreshDispatch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_dispatch_offers",
          filter: `rider_id=eq.${user.id}`,
        },
        refreshDispatch,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_dispatch_jobs",
          filter: `assigned_rider_id=eq.${user.id}`,
        },
        refreshDispatch,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, refreshDispatch]);

  // Live GPS tracking while online
  useEffect(() => {
    if (!online) return;

    const watchId = watchRiderLocation(async (coords) => {
      console.debug("watchRiderLocation: coords", coords);
      try {
        await setRiderPresence(true, coords);
      } catch (err) {
        console.error("Failed updating rider location", err);
      }
    });

    return () => {
      stopWatchingLocation(watchId);
    };
  }, [online]);

  const presence = useMutation({
    mutationFn: async (next: boolean) => {
      if (!next) {
        return setRiderPresence(false, null);
      }

      // Rider must have a valid GPS location before going online.
      const coords = await getCurrentLocation();

      return setRiderPresence(true, coords);
    },
    onSuccess: (_data, next) => {
      toast.success(next ? "You are online — bookings will come in" : "You are offline");
      void queryClient.invalidateQueries({ queryKey: ["rider-status"] });
    },
    onError: (error: Error) => {
      toast.error("Could not update status", {
        description: error.message || "Please allow location access and try again.",
      });
    },
  });

  const advance = useMutation({
    mutationFn: ({ jobId, step }: { jobId: string; step: "picked_up" | "delivered" }) =>
      advanceDispatch(jobId, step),
    onSuccess: (_data, variables) => {
      toast.success(variables.step === "picked_up" ? "Marked as picked up" : "Delivery completed");
      refreshDispatch();
      void queryClient.invalidateQueries({ queryKey: ["wallet"] });
    },
    onError: (error: Error) =>
      toast.error("Could not update delivery", { description: error.message }),
  });

  const completed = history ?? [];
  const today = new Date().toDateString();
  const todayCount = completed.filter(
    (job) => job.delivered_at && new Date(job.delivered_at).toDateString() === today,
  ).length;

  const showOffer = offer && offer.offer.id !== dismissedOffer && !activeJob;

  return (
    <>
      <Panel
        title="Availability"
        description="Only online riders receive booking requests."
        className="mb-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-11 items-center justify-center rounded-2xl ${
                online ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              <Power className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold">{online ? "Online" : "Offline"}</p>
              <p className="text-xs text-muted-foreground">
                {online
                  ? status?.is_available === false
                    ? "On a delivery — new bookings paused"
                    : "Waiting for nearby bookings"
                  : "Go online to start accepting deliveries"}
              </p>
            </div>
          </div>
          <Switch
            checked={online}
            disabled={
              presence.isPending ||
              (!online && minimumBalance != null && (wallet?.balance ?? 0) < minimumBalance)
            }
            onCheckedChange={(next) => presence.mutate(next)}
            aria-label="Toggle rider availability"
          />
        </div>
        {minimumBalance != null && (wallet?.balance ?? 0) < minimumBalance ? (
          <p className="mt-3 text-sm text-destructive">
            Your wallet balance must be at least {peso(minimumBalance)} to stay online. Top up to
            receive bookings.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Deliveries today" value={String(todayCount)} icon={RouteIcon} />
        <StatCard
          label="Completed"
          value={String(completed.length)}
          icon={PackageCheck}
          hint="Lifetime deliveries"
        />
        <StatCard
          label="Wallet balance"
          value={peso(wallet?.balance ?? 0)}
          icon={Wallet}
          hint="Weekly payouts"
        />
      </div>

      {debugDispatch ? (
        <Panel
          title="Dispatch diagnostics"
          description="Temporary live state for shared rider dispatch debugging."
          className="mt-6"
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Online</dt>
              <dd className="mt-1 font-semibold">{String(online)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Available</dt>
              <dd className="mt-1 font-semibold">{String(status?.is_available ?? null)}</dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Active job</dt>
              <dd className="mt-1 font-semibold">{activeJob?.id ?? "none"}</dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Pending offer
              </dt>
              <dd className="mt-1 font-semibold">{offer?.offer.id ?? "none"}</dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Offer type</dt>
              <dd className="mt-1 font-semibold">{offer?.job.dispatch_type ?? "n/a"}</dd>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Show popup</dt>
              <dd className="mt-1 font-semibold">{String(Boolean(showOffer))}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {activeJob ? (
        <Panel
          title={activeJob.dispatch_type === "pasugo" ? "Active Pasugo booking" : "Active delivery"}
          description={
            activeJob.dispatch_type === "pasugo"
              ? "Shared rider dispatch workflow for standalone booking."
              : "Follow the steps to complete this trip."
          }
          className="mt-6"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-extrabold">
                {peso(Number(activeJob.delivery_fee))}
              </p>
              <p className="text-sm text-muted-foreground">
                {Number(activeJob.distance_km).toFixed(1)} km ·{" "}
                {activeJob.status === "picked_up"
                  ? activeJob.dispatch_type === "pasugo"
                    ? "On the way to destination"
                    : "On the way to customer"
                  : activeJob.dispatch_type === "pasugo"
                    ? "Head to pickup"
                    : "Head to the store"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Leg
                icon={MapPin}
                label="Pick up"
                title={
                  activeJob.dispatch_type === "pasugo"
                    ? "Pickup"
                    : (activeJob.store_name ?? "Store")
                }
                detail={activeJob.pickup_address}
              />
              <Leg
                icon={Navigation}
                label="Drop off"
                title={activeJob.dispatch_type === "pasugo" ? "Destination" : "Customer"}
                detail={activeJob.dropoff_address}
              />
            </div>
            {activeJob.dispatch_type === "pasugo" && activeJob.customer_notes ? (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Customer notes
                </p>
                <p className="mt-1">{activeJob.customer_notes}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {activeJob.status === "assigned" ? (
                <Button
                  disabled={advance.isPending}
                  onClick={() => advance.mutate({ jobId: activeJob.id, step: "picked_up" })}
                >
                  Mark picked up
                </Button>
              ) : (
                <Button
                  disabled={advance.isPending}
                  onClick={() => advance.mutate({ jobId: activeJob.id, step: "delivered" })}
                >
                  Complete delivery
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/booking-chat/$orderId" params={{ orderId: activeJob.order_id }}>
                  Chat customer
                </Link>
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {application ? (
        <Panel
          title="Application status"
          description="The administrator's decision on your rider registration"
          className="mt-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Rider application</p>
              <p className="text-xs text-muted-foreground">
                Submitted {new Date(application.created_at).toLocaleDateString("en-PH")}
              </p>
              {application.review_notes ? (
                <p className="mt-2 text-xs text-muted-foreground">{application.review_notes}</p>
              ) : null}
            </div>
            <StatusBadge status={application.status} />
          </div>
        </Panel>
      ) : null}

      {showOffer ? (
        <BookingPopup data={offer} onClose={() => setDismissedOffer(offer.offer.id)} />
      ) : null}
      {pasugoOffer ? (
        <PasugoBookingPopup
          data={pasugoOffer}
          onClose={() => {
            void queryClient.invalidateQueries({ queryKey: ["pasugo-offer"] });
          }}
        />
      ) : null}
    </>
  );
}

function Leg({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof MapPin;
  label: string;
  title: string;
  detail: string | null;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-muted/50 p-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail ?? "—"}</p>
      </div>
    </div>
  );
}
