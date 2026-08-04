import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Store, Wallet } from "lucide-react";
import { useEffect } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/components/admin/primitives";
import { minimumWalletBalanceQuery, myWalletQuery } from "@/lib/wallet";
import { myStoresQuery } from "@/lib/stores";
import { storeAvailability } from "@/lib/store-status";
import { toast } from "sonner";

export const Route = createFileRoute("/seller")({
  head: () => ({
    meta: [
      { title: "Selling partner dashboard — RushOrder PH" },
      {
        name: "description",
        content: "Manage your RushOrder PH storefront, products, orders and payouts.",
      },
      { property: "og:title", content: "RushOrder PH partner dashboard" },
      { property: "og:description", content: "Storefront, products, orders and payouts." },
    ],
  }),
  component: SellerDashboard,
});

function SellerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({
        to: "/login",
        search: { next: "/seller" },
        replace: true,
      });
      return;
    }

    if (profile?.account_status === "suspended") {
      toast.error("Your seller account has been suspended.");
      void supabase.auth.signOut();
      navigate({ to: "/login", replace: true });
      return;
    }
  }, [loading, user, profile, navigate]);

  return (
    <DashboardLayout
      workspace="Partner workspace"
      items={[
        { to: "/seller", label: "Overview", icon: Store },
        { to: "/my-stores", label: "My stores", icon: Store },
        { to: "/my-products", label: "Products", icon: Package },
        { to: "/store-orders", label: "Orders", icon: ClipboardList },
        { to: "/seller-wallet", label: "Wallet", icon: Wallet },
      ]}
    >
      <PageHeader
        title="Partner overview"
        description="Your application status, storefront and sales at a glance."
      />
      <RoleGate kind="seller">
        <SellerOverview />
      </RoleGate>
    </DashboardLayout>
  );
}

function SellerOverview() {
  const { user } = useAuth();
  const { data: wallet } = useQuery(myWalletQuery(user?.id, "seller"));
  const { data: minimumBalance } = useQuery(minimumWalletBalanceQuery("seller"));
  const { data: stores } = useQuery(myStoresQuery(user?.id));
  const store = stores?.[0] ?? null;
  const availability = store ? storeAvailability(store) : null;
  const storeForcedOffline = Boolean(store?.wallet_hold) && !store?.is_online;
  const showWalletMinimumNotice =
    storeForcedOffline || (minimumBalance != null && (wallet?.balance ?? 0) < minimumBalance);

  const { data: application } = useQuery({
    queryKey: ["seller-application", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("seller_applications")
        .select("id, status, business_type, created_at, review_notes")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Store status"
          value={availability ? availability.label : "No store"}
          icon={Store}
          hint={availability?.detail ?? "Your storefront appears here once verified"}
        />
        <StatCard label="Orders this week" value="0" icon={ClipboardList} />
        <StatCard
          label="Wallet balance"
          value={peso(wallet?.balance ?? 0)}
          icon={Wallet}
          hint="Payouts run weekly"
        />
      </div>

      {store ? (
        <Panel
          title={store.name}
          description="Live in the marketplace — customers can browse anytime and order during your opening hours."
          className="mt-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                {availability?.open ? "Open — accepting orders" : "Closed for orders"}
              </p>
              <p className="text-xs text-muted-foreground">
                {availability?.detail ?? "Set your opening hours in My stores."}
              </p>
              {showWalletMinimumNotice ? (
                <p className="mt-2 text-sm text-destructive">
                  {minimumBalance != null
                    ? `Your wallet balance is below the required minimum of ${peso(minimumBalance)}. Top up to keep your storefront live.`
                    : "Your store is temporarily offline because your wallet balance is below the required minimum. Top up to resume receiving orders."}
                </p>
              ) : null}
            </div>
            <span
              className={
                availability?.open
                  ? "rounded-full bg-success/15 px-3 py-1 text-xs font-bold text-success"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground"
              }
            >
              {availability?.label ?? "Closed"}
            </span>
          </div>
        </Panel>
      ) : null}

      {application ? (
        <Panel
          title="Application status"
          description="The administrator's decision on your registration"
          className="mt-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold capitalize">
                {application!.business_type === "home_based"
                  ? "Home-based seller"
                  : "Registered business"}
              </p>
              <p className="text-xs text-muted-foreground">
                Submitted {new Date(application!.created_at).toLocaleDateString("en-PH")}
              </p>
              {application!.review_notes ? (
                <p className="mt-2 text-xs text-muted-foreground">{application!.review_notes}</p>
              ) : null}
            </div>
            <StatusBadge status={application!.status} />
          </div>
        </Panel>
      ) : null}
    </>
  );
}
