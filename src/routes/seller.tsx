import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Package, Store, Wallet } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader, Panel, StatCard, StatusBadge } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { peso } from "@/lib/currency";
import { myStoresQuery } from "@/lib/stores";
import { storeAvailability } from "@/lib/store-status";
import { minimumWalletBalanceQuery, myWalletQuery } from "@/lib/wallet";

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
  const queryClient = useQueryClient();

  const { data: wallet } = useQuery(myWalletQuery(user?.id, "seller"));
  const { data: minimumBalance } = useQuery(minimumWalletBalanceQuery("seller"));
  const { data: stores } = useQuery(myStoresQuery(user?.id));

  const store = stores?.[0] ?? null;
  const availability = store ? storeAvailability(store) : null;

  const storeForcedOffline = Boolean(store?.wallet_hold) && !store?.is_online;

  const showWalletMinimumNotice =
    storeForcedOffline || (minimumBalance != null && (wallet?.balance ?? 0) < minimumBalance);

  const visibilityMutation = useMutation({
    mutationFn: async (isVisible: boolean) => {
      if (!store) {
        throw new Error("Store not found.");
      }

      const { error } = await supabase
        .from("stores")
        .update({ is_visible: isVisible })
        .eq("id", store.id);

      if (error) throw error;
    },
    onSuccess: (_, isVisible) => {
      void queryClient.invalidateQueries({
        queryKey: ["my-stores"],
      });

      void queryClient.invalidateQueries({
        queryKey: ["marketplace-stores"],
      });

      toast.success(isVisible ? "Store is now visible" : "Store hidden from marketplace");
    },
    onError: (error: Error) => {
      toast.error("Could not update store visibility", {
        description: error.message,
      });
    },
  });

  const { data: ordersThisWeek = 0 } = useQuery({
    queryKey: ["seller-orders-this-week", user?.id, store?.id],
    enabled: Boolean(user && store),
    queryFn: async () => {
      const start = new Date();
      const day = start.getDay();
      const diff = day === 0 ? -6 : 1 - day;

      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);

      const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store!.id)
        .gte("created_at", start.toISOString())
        .is("deleted_at", null);

      if (error) throw error;

      return count ?? 0;
    },
  });

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

        <StatCard label="Orders this week" value={String(ordersThisWeek)} icon={ClipboardList} />

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

          <div className="mt-4 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Marketplace visibility</p>

              <p className="text-xs text-muted-foreground">
                {store.is_visible
                  ? "Customers can find your store in the marketplace."
                  : "Your store is hidden from marketplace discovery."}
              </p>
            </div>

            <Button
              size="sm"
              variant={store.is_visible ? "outline" : "default"}
              disabled={visibilityMutation.isPending}
              onClick={() => visibilityMutation.mutate(!store.is_visible)}
            >
              {visibilityMutation.isPending
                ? "Updating…"
                : store.is_visible
                  ? "Hide store"
                  : "Show store"}
            </Button>
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
                {application.business_type === "home_based"
                  ? "Home-based seller"
                  : "Registered business"}
              </p>

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
    </>
  );
}
