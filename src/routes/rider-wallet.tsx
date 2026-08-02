import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bike, PackageCheck, Wallet } from "lucide-react";
import { useEffect } from "react";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { PageHeader } from "@/components/dashboard/primitives";
import { RoleGate } from "@/components/dashboard/role-gate";
import { WalletModule } from "@/components/wallet/wallet-module";
import { useAuth } from "@/contexts/auth-context";

export const Route = createFileRoute("/rider-wallet")({
  head: () => ({
    meta: [
      { title: "Rider wallet — RushOrder PH" },
      {
        name: "description",
        content: "Top up your RushOrder PH rider wallet and review delivery earnings.",
      },
      { property: "og:title", content: "RushOrder PH rider wallet" },
      { property: "og:description", content: "Balance, top-ups and earnings history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiderWalletPage,
});

function RiderWalletPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/rider-wallet" }, replace: true });
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
      <PageHeader title="Rider wallet" description="Balance, top-ups and delivery earnings." />
      <RoleGate kind="rider">
        <WalletModule walletType="rider" />
      </RoleGate>
    </DashboardLayout>
  );
}
