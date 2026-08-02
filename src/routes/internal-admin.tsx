import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bike,
  ClipboardList,
  CreditCard,
  History,
  LayoutDashboard,
  Megaphone,
  Radar,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

import { AdminLogin, AdminSecuritySetup } from "@/components/admin/admin-auth-screens";
import { DashboardLayout, type NavItem } from "@/components/dashboard/dashboard-layout";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/admin-auth-context";
import { ADMIN_ROLE_LABELS, roleCan, type AdminPermission } from "@/lib/admin/contracts";

/**
 * Hidden internal admin portal.
 *
 * Authentication is fully isolated from the public app: administrators sign in
 * with portal-only credentials backed by an encrypted server session, never a
 * Supabase Auth account. Every read and write is re-authorized server-side, so
 * reaching this URL directly grants nothing.
 */
export const Route = createFileRoute("/internal-admin")({
  head: () => ({
    meta: [
      { title: "Internal admin — RushOrder PH" },
      { name: "description", content: "Internal RushOrder PH operations console." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InternalAdminRoot,
});

interface AdminNavItem extends NavItem {
  permission?: AdminPermission;
}

const NAV: AdminNavItem[] = [
  { to: "/internal-admin", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/internal-admin/store-applications",
    label: "Store applications",
    icon: Store,
    permission: "applications",
  },
  {
    to: "/internal-admin/rider-applications",
    label: "Rider applications",
    icon: ClipboardList,
    permission: "applications",
  },
  { to: "/internal-admin/customers", label: "Customers", icon: Users, permission: "members" },
  { to: "/internal-admin/sellers", label: "Sellers", icon: Store, permission: "members" },
  { to: "/internal-admin/riders", label: "Riders", icon: Bike, permission: "members" },
  { to: "/internal-admin/orders", label: "Orders", icon: ShoppingBag, permission: "orders" },
  { to: "/internal-admin/dispatch", label: "Rider dispatch", icon: Radar, permission: "orders" },
  { to: "/internal-admin/wallets", label: "Wallets", icon: Wallet, permission: "wallets" },
  { to: "/internal-admin/topups", label: "Wallet top-ups", icon: Wallet, permission: "wallets" },
  {
    to: "/internal-admin/payment-methods",
    label: "Payment methods",
    icon: CreditCard,
    permission: "payments",
  },
  { to: "/internal-admin/reports", label: "Reports", icon: BarChart3, permission: "reports" },
  {
    to: "/internal-admin/announcements",
    label: "Announcements",
    icon: Megaphone,
    permission: "announcements",
  },
  {
    to: "/internal-admin/settings",
    label: "Platform settings",
    icon: Settings,
    permission: "settings",
  },
  { to: "/internal-admin/users", label: "Admin users", icon: UserCog, permission: "admin_users" },
  { to: "/internal-admin/audit", label: "Audit log", icon: History, permission: "audit" },
  { to: "/internal-admin/account", label: "My account", icon: ShieldCheck },
];

/** Route path → permission required to view it. */
const ROUTE_PERMISSIONS = new Map(
  NAV.filter((item) => item.permission).map((item) => [
    item.to,
    item.permission as AdminPermission,
  ]),
);

function InternalAdminRoot() {
  return (
    <AdminAuthProvider>
      <InternalAdminGate />
    </AdminAuthProvider>
  );
}

function InternalAdminGate() {
  const { session, loading, signOut } = useAdminAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking your access…
      </div>
    );
  }

  if (!session) return <AdminLogin />;
  if (session.mustChangeCredentials) return <AdminSecuritySetup />;

  const items = NAV.filter((item) => !item.permission || roleCan(session.role, item.permission));
  const required = ROUTE_PERMISSIONS.get(pathname);
  const permitted = !required || roleCan(session.role, required);

  return (
    <DashboardLayout
      workspace="Internal admin"
      items={items}
      identity={`${session.username} · ${ADMIN_ROLE_LABELS[session.role]}`}
      onSignOut={() => signOut()}
    >
      {permitted ? <Outlet /> : <NotPermitted />}
    </DashboardLayout>
  );
}

function NotPermitted() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldAlert className="size-6" />
      </span>
      <div>
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          Not available for your role
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Your administrator role does not include this area. Ask a Super Admin if you need access.
        </p>
      </div>
    </div>
  );
}
