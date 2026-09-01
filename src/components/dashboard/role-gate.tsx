/**
 * Role + application gate for the Seller and Rider dashboards.
 *
 * Access is decided by the existing `user_roles` table (the same rows RLS
 * checks), with the latest application row used to explain *why* access is not
 * granted yet. No new role or approval system is introduced.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bike, ClipboardCheck, Clock, Store, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatPhilippineDate } from "@/lib/date";

type Kind = "seller" | "rider";

const COPY = {
  seller: {
    icon: Store,
    notRegistered: "You are not a registered seller.",
    description:
      "Partner stores can list products, receive orders and get paid through the RushOrder PH wallet.",
    cta: "Become a Partner Store",
    apply: "/become-seller",
    table: "seller_applications",
  },
  rider: {
    icon: Bike,
    notRegistered: "You are not a registered rider.",
    description:
      "Riders accept nearby deliveries and earn per completed trip, paid into a rider wallet.",
    cta: "Become a Rider",
    apply: "/become-rider",
    table: "rider_applications",
  },
} as const;

function latestApplicationQuery(kind: Kind, userId: string | undefined) {
  return {
    queryKey: [`${kind}-application`, userId ?? null],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(COPY[kind].table)
        .select("id, status, created_at, review_notes")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

function reapplyEnabledQuery() {
  return {
    queryKey: ["setting", "allow_application_reapply"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "allow_application_reapply")
        .maybeSingle();
      return data?.value === false ? false : true;
    },
  };
}

export function RoleGate({ kind, children }: { kind: Kind; children: ReactNode }) {
  const { user, loading, hasRole } = useAuth();
  const copy = COPY[kind];

  const { data: application, isLoading } = useQuery({
    ...latestApplicationQuery(kind, user?.id),
    enabled: Boolean(user),
  });

  // One approval state: the role row is authoritative, and an approved
  // application counts too so the dashboard never lags behind the decision.
  const approved = hasRole(kind) || application?.status === "approved";
  const { data: reapplyEnabled } = useQuery(reapplyEnabledQuery());

  if (approved) return <>{children}</>;

  if (loading || isLoading) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Checking your access…</p>;
  }

  if (application?.status === "pending" || application?.status === "under_review") {
    const submitted = new Date(application.created_at);
    const estimate = new Date(submitted.getTime() + 3 * 86400000);
    return (
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-card text-warning-foreground">
          <Clock className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-lg font-extrabold tracking-tight">
          Your application is currently under review.
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <Detail
            label="Status"
            value={application.status === "pending" ? "Pending review" : "Under review"}
          />
          <Detail label="Date submitted" value={formatPhilippineDate(submitted)} />
          <Detail label="Estimated review" value={`by ${formatPhilippineDate(estimate)}`} />
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          We'll notify you here and by in-app notification as soon as a decision is made.
        </p>
      </div>
    );
  }

  if (application?.status === "rejected") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-card text-destructive">
          <XCircle className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-lg font-extrabold tracking-tight">
          Your application was not approved.
        </h2>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          {application.review_notes ??
            "No reason was provided. Please contact RushOrder PH support for details."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {reapplyEnabled ? (
            <Button asChild>
              <Link to={copy.apply}>Apply again</Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Re-applications are temporarily closed. Please contact support.
            </p>
          )}
          <Button asChild variant="outline">
            <Link to="/contact">Contact support</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EmptyState
      icon={copy.icon}
      title={copy.notRegistered}
      description={copy.description}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to={copy.apply}>
              <ClipboardCheck className="size-4" /> {copy.cta} — Apply now
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/marketplace">Browse marketplace</Link>
          </Button>
        </div>
      }
    />
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}
