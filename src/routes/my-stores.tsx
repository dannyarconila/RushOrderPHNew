import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Package, Store } from "lucide-react";
import { useEffect, useState } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { StoreEditor } from "@/components/stores/store-editor";
import { VerificationBadge } from "@/components/stores/verification-badge";
import { useAuth } from "@/contexts/auth-context";
import { myStoresQuery } from "@/lib/stores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/my-stores")({
  head: () => ({
    meta: [
      { title: "My stores — RushOrder PH partners" },
      {
        name: "description",
        content:
          "Manage your RushOrder PH storefronts: branding, address, business hours and delivery rules.",
      },
      { property: "og:title", content: "My stores — RushOrder PH" },
      {
        property: "og:description",
        content: "Manage storefront branding, hours and delivery rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyStoresPage,
});

function MyStoresPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/my-stores" }, replace: true });
  }, [loading, user, navigate]);

  const { data: stores, isLoading } = useQuery(myStoresQuery(user?.id));
  const active = stores?.find((s) => s.id === activeId) ?? stores?.[0] ?? null;

  return (
    <DashboardLayout
      workspace="Partner workspace"
      items={[
        { to: "/seller", label: "Overview", icon: Store },
        { to: "/my-stores", label: "My stores", icon: Store },
        { to: "/my-products", label: "Products", icon: Package },
        { to: "/store-orders", label: "Orders", icon: ClipboardList },
      ]}
    >
      <PageHeader
        title="My stores"
        description="Update branding, address, schedule and delivery rules for each storefront."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your stores…</p>
      ) : !stores || stores.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No storefront yet"
          description="Your store is created automatically once your selling partner application is approved."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {stores.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {stores.map((store) => (
                <button
                  key={store.id}
                  type="button"
                  onClick={() => setActiveId(store.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                    active?.id === store.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary",
                  )}
                >
                  {store.name}
                </button>
              ))}
            </div>
          ) : null}

          {active ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold">{active.name}</h2>
                <VerificationBadge status={active.verification_status} />
              </div>
              <StoreEditor key={active.id} store={active} userId={user!.id} />
            </>
          ) : null}
        </div>
      )}
    </DashboardLayout>
  );
}
