import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { IncomingOrderPopup } from "@/components/seller/incoming-order-popup";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { myStoresQuery } from "@/lib/stores";

export function SellerIncomingOrderListener() {
  const { user } = useAuth();
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [queuedOrderIds, setQueuedOrderIds] = useState<string[]>([]);
  const queuedRef = useRef<string[]>([]);
  const activeRef = useRef<string | null>(null);

  const { data: stores } = useQuery({
    ...myStoresQuery(user?.id),
    enabled: Boolean(user?.id),
  });

  const storeIds = (stores ?? []).map((store) => store.id);
  const storeKey = storeIds.join(",");

  const syncQueue = useCallback((ids: string[]) => {
    queuedRef.current = ids;
    setQueuedOrderIds(ids);
  }, []);

  const enqueueOrder = useCallback(
    (orderId: string) => {
      if (!orderId || orderId === activeRef.current || queuedRef.current.includes(orderId)) {
        return;
      }

      const nextQueue = [...queuedRef.current, orderId];
      syncQueue(nextQueue);

      if (!activeRef.current) {
        const [nextOrder, ...remaining] = nextQueue;
        activeRef.current = nextOrder;
        setActiveOrderId(nextOrder);
        syncQueue(remaining);

        console.log(
          "[Seller popup] OPENING QUEUED ORDER:",
          nextOrder,
          "remaining:",
          remaining.length,
        );
      } else {
        console.log("[Seller popup] ORDER QUEUED:", orderId, "queue size:", nextQueue.length);
      }
    },
    [syncQueue],
  );

  const advanceQueue = useCallback(() => {
    const [nextOrder, ...remaining] = queuedRef.current;

    activeRef.current = nextOrder ?? null;
    setActiveOrderId(nextOrder ?? null);
    syncQueue(remaining);

    if (nextOrder) {
      console.log(
        "[Seller popup] OPENING NEXT QUEUED ORDER:",
        nextOrder,
        "remaining:",
        remaining.length,
      );
    } else {
      console.log("[Seller popup] QUEUE EMPTY");
    }
  }, [syncQueue]);

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

          console.log("[Seller popup] Order notification received:", notification.title);

          const { data, error } = await supabase
            .from("orders")
            .select("id,status,created_at")
            .in("store_id", storeIds)
            .eq("status", "pending")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            console.error("[Seller popup] Could not find pending orders:", error);
            return;
          }

          const pendingIds = (data ?? [])
            .map((order) => order.id)
            .filter(Boolean)
            .reverse();

          for (const orderId of pendingIds) {
            enqueueOrder(orderId);
          }
        },
      )
      .subscribe((status) => {
        console.log(`[Seller popup] notifications: ${status}`);
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, storeKey, enqueueOrder]);

  if (!activeOrderId) return null;

  return (
    <>
      <IncomingOrderPopup orderId={activeOrderId} onClose={advanceQueue} />

      {queuedOrderIds.length > 0 ? (
        <div className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold shadow-lg">
          {queuedOrderIds.length} more incoming order
          {queuedOrderIds.length === 1 ? "" : "s"} waiting
        </div>
      ) : null}
    </>
  );
}
