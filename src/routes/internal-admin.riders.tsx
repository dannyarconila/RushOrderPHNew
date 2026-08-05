import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useMemo } from "react";

import { MemberDirectory } from "@/components/admin/member-directory";
import { DetailGrid, Section, Td, peso } from "@/components/admin/primitives";
import { PageHeader } from "@/components/dashboard/primitives";
import { adminReadFn } from "@/lib/admin/data.functions";
import { adminOrdersQuery, walletsQuery } from "@/lib/admin/queries";

type PasugoDispatchJobRow = {
  id: string;
  booking_id: string;
  status: string;
  assigned_rider_id: string | null;
  delivery_fee: number;
  created_at: string;
  delivered_at: string | null;
};

function adminPasugoDispatchJobsQuery() {
  return queryOptions({
    queryKey: ["admin", "riders", "pasugo-dispatch-jobs"],
    queryFn: async (): Promise<PasugoDispatchJobRow[]> => {
      const result = await adminReadFn({
        data: {
          table: "pasugo_dispatch_jobs",
          columns: "id,booking_id,status,assigned_rider_id,delivery_fee,created_at,delivered_at",
          order: [{ column: "created_at", ascending: false }],
          limit: 1000,
        },
      });
      return (result.rows ?? []) as PasugoDispatchJobRow[];
    },
  });
}

export const Route = createFileRoute("/internal-admin/riders")({
  component: RidersPage,
});

function RidersPage() {
  const { data: wallets } = useQuery(walletsQuery());
  const { data: orders } = useQuery(adminOrdersQuery("all", 1000));
  const { data: pasugoJobs } = useQuery(adminPasugoDispatchJobsQuery());

  const stats = useMemo(() => {
    const map = new Map<string, { deliveries: number; earnings: number }>();
    for (const order of orders ?? []) {
      if (!order.rider_id) continue;
      const entry = map.get(order.rider_id) ?? { deliveries: 0, earnings: 0 };
      if (order.status === "delivered") {
        entry.deliveries += 1;
        entry.earnings += Number(order.rider_commission ?? 0);
      }
      map.set(order.rider_id, entry);
    }
    return map;
  }, [orders]);

  const pasugoStats = useMemo(() => {
    const map = new Map<
      string,
      { active: number; completed: number; grossFare: number; latestStatus: string | null }
    >();
    for (const job of pasugoJobs ?? []) {
      if (!job.assigned_rider_id) continue;
      const entry = map.get(job.assigned_rider_id) ?? {
        active: 0,
        completed: 0,
        grossFare: 0,
        latestStatus: null,
      };

      if (job.status === "assigned" || job.status === "picked_up") {
        entry.active += 1;
      }
      if (job.status === "delivered") {
        entry.completed += 1;
        entry.grossFare += Number(job.delivery_fee ?? 0);
      }
      if (!entry.latestStatus) {
        entry.latestStatus = job.status;
      }
      map.set(job.assigned_rider_id, entry);
    }
    return map;
  }, [pasugoJobs]);

  const walletFor = (userId: string) =>
    (wallets ?? []).find((w) => w.user_id === userId && w.wallet_type === "rider");

  return (
    <>
      <PageHeader
        title="Riders"
        description="Active riders, delivery history, wallet balances and moderation."
      />

      <MemberDirectory
        role="rider"
        emptyTitle="No riders yet"
        emptyDescription="Approved riders will appear here once applications are accepted."
        extraHead={["Deliveries", "Pasugo", "Wallet"]}
        renderExtra={(member) => {
          const s = stats.get(member.id);
          const p = pasugoStats.get(member.id);
          const wallet = walletFor(member.id);
          return (
            <>
              <Td>
                <p className="text-sm font-semibold">{s?.deliveries ?? 0}</p>
                <p className="text-xs text-muted-foreground">{peso(s?.earnings ?? 0)} earned</p>
              </Td>
              <Td>
                <p className="text-sm font-semibold">{p?.active ?? 0} active</p>
                <p className="text-xs text-muted-foreground">{p?.completed ?? 0} completed</p>
              </Td>
              <Td className="text-sm">{wallet ? peso(wallet.balance) : "—"}</Td>
            </>
          );
        }}
        renderDetails={(member) => {
          const s = stats.get(member.id);
          const p = pasugoStats.get(member.id);
          const wallet = walletFor(member.id);
          return (
            <>
              <Section title="Delivery activity">
                <DetailGrid
                  data={{
                    completed_deliveries: String(s?.deliveries ?? 0),
                    total_earnings: peso(s?.earnings ?? 0),
                  }}
                />
              </Section>
              <Section title="Wallet">
                <DetailGrid
                  data={{
                    balance: wallet ? peso(wallet.balance) : "—",
                    pending: wallet ? peso(wallet.pending_balance) : "—",
                    active: wallet ? String(wallet.is_active) : "—",
                  }}
                />
              </Section>
              <Section title="Pasugo activity">
                <DetailGrid
                  data={{
                    active_bookings: String(p?.active ?? 0),
                    completed_bookings: String(p?.completed ?? 0),
                    gross_fare: peso(p?.grossFare ?? 0),
                    latest_status: p?.latestStatus ?? "—",
                  }}
                />
              </Section>
            </>
          );
        }}
      />
    </>
  );
}
