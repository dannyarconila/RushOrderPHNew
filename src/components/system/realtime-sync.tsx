/**
 * Global approval/state synchronisation.
 *
 * One Realtime subscription keeps every surface (marketplace, seller, rider,
 * customer, admin) reading the same approval state without a manual refresh.
 * Nothing here owns state — it only invalidates the TanStack Query caches that
 * derive from the affected tables.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";

/** Query key prefixes to refresh per table. */
const INVALIDATIONS: Record<string, string[][]> = {
  stores: [["stores"], ["store"], ["my-stores"], ["admin"], ["product-search"]],
  products: [["store-products"], ["manage-products"], ["product-search"], ["admin"]],
  seller_applications: [["seller-application"], ["admin"], ["my-stores"], ["stores"]],
  rider_applications: [["rider-application"], ["rider-status"], ["admin"]],
  user_roles: [["admin"]],
  orders: [["orders"], ["store-orders"], ["my-orders"], ["customer-orders"], ["order"], ["admin"]],
  order_items: [["order-items"], ["admin"]],
  notifications: [["notifications"]],
  wallets: [["wallet"], ["wallet-transactions"], ["admin"]],
  wallet_topups: [
    ["wallet-topups"],
    ["wallet"],
    ["wallet-transactions"],
    ["my-stores"],
    ["stores"],
    ["admin"],
  ],
  payment_methods: [["payment-methods"], ["admin"]],
  rider_status: [["rider-status"], ["dispatch-offer"], ["dispatch-active-job"], ["admin"]],
  dispatch_offers: [["dispatch-offer"], ["dispatch-active-job"], ["dispatch-history"], ["admin"]],
  pasugo_bookings: [["pasugo-booking"], ["pasugo-customer-latest"], ["pasugo-chat"], ["admin"]],
  pasugo_dispatch_jobs: [["pasugo-job"], ["pasugo-active-job"], ["pasugo-offer"], ["admin"]],
  pasugo_dispatch_offers: [["pasugo-offer"], ["pasugo-active-job"], ["admin"]],
  pasugo_chat_messages: [["pasugo-chat"], ["pasugo-booking"]],
  system_settings: [
    ["public-settings"],
    ["dispatch-settings"],
    ["minimum-wallet-balance"],
    ["my-stores"],
    ["stores"],
    ["store-orders"],
    ["wallet"],
    ["wallet-transactions"],
    ["rider-status"],
    ["dispatch-offer"],
    ["dispatch-active-job"],
    ["dispatch-history"],
    ["setting"],
    ["admin"],
  ],
  dispatch_jobs: [["dispatch-job"], ["dispatch-active-job"], ["dispatch-history"], ["admin"]],
  deliveries: [["dispatch-job"], ["dispatch-active-job"], ["admin"]],
  dispatch_chat_messages: [["booking-chat"], ["dispatch-job"], ["dispatch-active-job"]],
};

export function RealtimeSync() {
  const queryClient = useQueryClient();
  const { user, refreshRoles } = useAuth();

  useEffect(() => {
    const channel = supabase.channel("rushorder-sync");

    for (const table of Object.keys(INVALIDATIONS)) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        for (const queryKey of INVALIDATIONS[table]) {
          void queryClient.invalidateQueries({ queryKey });
        }
        // Approval grants or revokes a role: refresh the signed-in user's roles
        // so dashboards flip out of "pending" immediately.
        if (
          table === "user_roles" ||
          table === "seller_applications" ||
          table === "rider_applications"
        ) {
          const row = (payload.new ?? payload.old) as { user_id?: string } | null;
          if (user && row?.user_id === user.id) void refreshRoles();
        }
      });
    }

    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, user, refreshRoles]);

  return null;
}
