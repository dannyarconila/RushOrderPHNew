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

import { peso } from "@/components/admin/primitives";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { BookingPopup } from "@/components/rider/booking-popup";
import { PasugoBookingPopup } from "@/components/rider/pasugo-booking-popup";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  activeJobQuery,
  advanceDispatch,
  currentPosition,
  pendingOfferQuery,
  riderHistoryQuery,
  riderStatusQuery,
  setRiderPresence,
  watchRiderLocation,
  stopWatchingLocation,
} from "@/lib/dispatch";
import {
  activePasugoJobForRiderQuery,
  advancePasugoDispatch,
  pasugoBookingQuery,
  riderPendingPasugoOfferQuery,
  type PasugoDispatchJob,
} from "@/lib/pasugo";
import { minimumWalletBalanceQuery, myWalletQuery } from "@/lib/wallet";

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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", search: { next: "/rider" }, replace: true });
  }, [loading, user, navigate]);

  return (
    <DashboardLayout
      workspace="Rider workspace"
      items={[
        { to: "/rider", label: "Overview", icon: Bike },
        { to: "/customer", label: "My orders", icon: PackageCheck },
        { to: "/rider-wallet", label: "Wallet", icon: Wallet },
      ]}
    >
      <PageHeader
        title="Rider overview"
        description="Go online to receive live booking requests near you."
      />
      <RoleGate kind="rider">
        <RiderOverview />
      </RoleGate>
    </DashboardLayout>
  );
}

function RiderOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dismissedOffer, setDismissedOffer] = useState<string | null>(null);
  const [dismissedPasugoOffer, setDismissedPasugoOffer] = useState<string | null>(null);

  const { data: wallet } = useQuery(myWalletQuery(user?.id, "rider"));
  const { data: minimumBalance } = useQuery(minimumWalletBalanceQuery("rider"));
  const { data: status } = useQuery(riderStatusQuery(user?.id));
  const { data: history } = useQuery(riderHistoryQuery(user?.id));
  const { data: activeJob } = useQuery(activeJobQuery(user?.id));
  const { data: activePasugoJob } = useQuery(activePasugoJobForRiderQuery(user?.id));
  const { data: activePasugoBooking } = useQuery({
    ...pasugoBookingQuery(activePasugoJob?.booking_id ?? ""),
    enabled: Boolean(activePasugoJob?.booking_id),
  });
  const online = Boolean(status?.is_online);

  const { data: offer } = useQuery({
    ...pendingOfferQuery(user?.id),
    enabled: Boolean(user) && online && !activeJob && !activePasugoJob,
    refetchInterval: online && !activeJob && !activePasugoJob ? 5000 : false,
  });

  const { data: pasugoOffer } = useQuery({
    ...riderPendingPasugoOfferQuery(user?.id),
    enabled: Boolean(user) && online && !activeJob && !activePasugoJob,
    refetchInterval: online && !activeJob && !activePasugoJob ? 5000 : false,
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
    void queryClient.invalidateQueries({ queryKey: ["pasugo-offer"] });
    void queryClient.invalidateQueries({ queryKey: ["pasugo-active-job"] });
    void queryClient.invalidateQueries({ queryKey: ["rider-status"] });
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
    mutationFn: async (next: boolean) =>
      setRiderPresence(next, next ? await currentPosition() : null),
    onSuccess: (_data, next) => {
      toast.success(next ? "You are online — bookings will come in" : "You are offline");
      void queryClient.invalidateQueries({ queryKey: ["rider-status"] });
    },
    onError: (error: Error) =>
      toast.error("Could not update status", { description: error.message }),
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
  const showPasugoOffer = pasugoOffer && pasugoOffer.offer.id !== dismissedPasugoOffer && !activeJob && !activePasugoJob;

  const advancePasugo = useMutation({
    mutationFn: ({ jobId, step }: { jobId: string; step: "arrived" | "picked_up" | "delivered" | "completed" }) =>
      advancePasugoDispatch(jobId, step),
    onSuccess: (_data, variables) => {
      const labelMap: Record<string, string> = {
        arrived: "Marked as arrived",
        picked_up: "Marked as picked up",
        delivered: "Marked as delivered",
        completed: "Booking completed",
      };
      toast.success(labelMap[variables.step] ?? "Pasugo booking updated");
      refreshDispatch();
      void queryClient.invalidateQueries({ queryKey: ["pasugo-booking"] });
    },
    onError: (error: Error) =>
      toast.error("Could not update Pasugo booking", { description: error.message }),
  });

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

      {activeJob ? (
        <Panel
          title="Active delivery"
          description="Follow the steps to complete this trip."
          className="mt-6"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-display text-2xl font-extrabold">
                {peso(Number(activeJob.delivery_fee))}
              </p>
              <p className="text-sm text-muted-foreground">
                {Number(activeJob.distance_km).toFixed(1)} km ·{" "}
                {activeJob.status === "picked_up" ? "On the way to customer" : "Head to the store"}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Leg
                icon={MapPin}
                label="Pick up"
                title={activeJob.store_name ?? "Store"}
                detail={activeJob.pickup_address}
              />
              <Leg
                icon={Navigation}
                label="Drop off"
                title="Customer"
                detail={activeJob.dropoff_address}
              />
            </div>
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

      {activePasugoJob ? (
        <Panel
          title="Active Pasugo booking"
          description="Standalone errand booking currently assigned to you."
          className="mt-6"
        >
          <PasugoActivePanel
            job={activePasugoJob}
            riderFeePerBooking={activePasugoBooking?.rider_fee_per_booking ?? null}
            busy={advancePasugo.isPending}
            onStep={(step) => advancePasugo.mutate({ jobId: activePasugoJob.id, step })}
            onOpenChat={() =>
              navigate({
                to: "/pasugo-chat/$bookingId",
                params: { bookingId: activePasugoJob.booking_id },
              })
            }
          />
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

      {showPasugoOffer ? (
        <PasugoBookingPopup
          data={pasugoOffer}
          onClose={() => setDismissedPasugoOffer(pasugoOffer.offer.id)}
        />
      ) : null}
    </>
  );
}

function PasugoActivePanel({
  job,
  riderFeePerBooking,
  busy,
  onStep,
  onOpenChat,
}: {
  job: PasugoDispatchJob;
  riderFeePerBooking: number | null;
  busy: boolean;
  onStep: (step: "arrived" | "picked_up" | "delivered" | "completed") => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-display text-2xl font-extrabold">{peso(Number(job.delivery_fee))}</p>
        <p className="text-sm text-muted-foreground">
          {Number(job.distance_km).toFixed(1)} km · {job.status === "picked_up" ? "Heading to destination" : "Go to pickup"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Leg icon={MapPin} label="Pick up" title="Pickup" detail={job.pickup_address} />
        <Leg icon={Navigation} label="Drop off" title="Destination" detail={job.dropoff_address} />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Rider platform fee</p>
        <p className="mt-1 font-semibold">
          {riderFeePerBooking != null
            ? peso(Number(riderFeePerBooking))
            : "Pending (deducted after successful delivery)"}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        {job.status === "assigned" ? (
          <>
            <Button disabled={busy} onClick={() => onStep("arrived")}>Mark arrived</Button>
            <Button disabled={busy} onClick={() => onStep("picked_up")}>Mark picked up</Button>
          </>
        ) : null}

        {job.status === "picked_up" ? (
          <>
            <Button disabled={busy} onClick={() => onStep("delivered")}>Mark delivered</Button>
            <Button disabled={busy} onClick={() => onStep("completed")}>Complete booking</Button>
          </>
        ) : null}

        <Button variant="outline" onClick={onOpenChat}>
          Chat customer
        </Button>
      </div>
    </div>
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
