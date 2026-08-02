import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Package, Store, Wallet } from "lucide-react";
import { useEffect } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { WalletModule } from "@/components/wallet/wallet-module";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/seller-wallet")({
  head: () => ({
    meta: [
      { title: "Seller wallet — RushOrder PH" },
      {
        name: "description",
        content: "Top up your RushOrder PH seller wallet, track balances and payouts.",
      },
      { property: "og:title", content: "RushOrder PH seller wallet" },
      { property: "og:description", content: "Balance, top-ups, transactions and payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SellerWalletPage,
});

function SellerWalletPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/seller-wallet" }, replace: true });
  }, [loading, user, navigate]);

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
        title="Seller wallet"
        description="Balance, top-ups, transactions and payout history."
      />
      <RoleGate kind="seller">
        <WalletModule walletType="seller" />
      </RoleGate>
    </DashboardLayout>
  );
}
