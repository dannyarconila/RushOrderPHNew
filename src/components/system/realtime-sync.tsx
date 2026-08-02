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
  rider_applications: [["rider-application"], ["admin"]],
  user_roles: [["admin"]],
  orders: [["orders"], ["store-orders"], ["my-orders"], ["order"], ["admin"]],
  notifications: [["notifications"]],
  wallets: [["wallet"], ["wallet-transactions"], ["admin"]],
  dispatch_jobs: [["dispatch-job"], ["dispatch-active-job"], ["dispatch-history"], ["admin"]],
  deliveries: [["dispatch-job"], ["dispatch-active-job"], ["admin"]],
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
