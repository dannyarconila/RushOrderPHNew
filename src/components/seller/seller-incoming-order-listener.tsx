import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { IncomingOrderPopup } from "@/components/seller/incoming-order-popup";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { myStoresQuery } from "@/lib/stores";

export function SellerIncomingOrderListener() {
  const { user } = useAuth();
  const [incomingOrderId, setIncomingOrderId] = useState<string | null>(null);

  const { data: stores } = useQuery({
    ...myStoresQuery(user?.id),
    enabled: Boolean(user?.id),
  });

  const storeIds = (stores ?? []).map((store) => store.id);
  const storeKey = storeIds.join(",");

  useEffect(() => {
    if (!user?.id || storeIds.length === 0) return;

    const channel = supabase
      .channel(`seller-order-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const notification = payload.new as {
            kind?: string;
            title?: string;
          };

          if (notification.kind !== "order") return;

          console.log(
            "[Seller popup] Order notification received:",
            notification.title,
          );

          const { data, error } = await supabase
            .from("orders")
            .select("id,status,created_at")
            .in("store_id", storeIds)
            .eq("status", "pending")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error(
              "[Seller popup] Could not find pending order:",
              error,
            );
            return;
          }

          if (data?.id) {
            console.log(
              "[Seller popup] OPENING INCOMING ORDER POPUP:",
              data.id,
            );
            setIncomingOrderId(data.id);
          }
        },
      )
      .subscribe((status) => {
        console.log(`[Seller popup] notifications: ${status}`);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, storeKey]);

  if (!incomingOrderId) return null;

  return (
    <IncomingOrderPopup
      orderId={incomingOrderId}
      onClose={() => setIncomingOrderId(null)}
    />
  );
}
