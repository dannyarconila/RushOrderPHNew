import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  AdminTable,
  FilterBar,
  FilterChip,
  Td,
  shortId,
} from "@/components/admin/primitives";
import { PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { adminReportsQuery, type SalesBucket } from "@/lib/admin/queries";
import { peso } from "@/lib/currency";
import { BarChart3, Receipt, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/internal-admin/reports")({
  component: ReportsPage,
});

const RANGES = ["daily", "weekly", "monthly"] as const;

function ReportsPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("daily");
  const { data, isLoading } = useQuery(adminReportsQuery(90));

  const buckets: SalesBucket[] = (data ? data[range] : []).slice(0, 24);

  return (
    <>
      <PageHeader
        title="Sales reports"
        description="Order volume, gross revenue and platform commission (last 90 days)."
      />

      {isLoading || !data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Crunching numbers…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Orders"
              value={String(data.totals.orders)}
              icon={Receipt}
              hint="Last 90 days"
            />
            <StatCard label="Gross revenue" value={peso(data.totals.revenue)} icon={TrendingUp} />
            <StatCard label="Commission" value={peso(data.totals.commission)} icon={BarChart3} />
          </div>

          <Panel title="Sales breakdown" className="mt-6">
            <FilterBar>
              {RANGES.map((r) => (
                <FilterChip key={r} active={range === r} onClick={() => setRange(r)}>
                  {r}
                </FilterChip>
              ))}
            </FilterBar>
            {buckets.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales in this period.
              </p>
            ) : (
              <AdminTable head={["Period", "Orders", "Revenue", "Commission"]}>
                {buckets.map((bucket) => (
                  <tr key={bucket.key}>
                    <Td className="text-sm font-semibold">{bucket.label}</Td>
                    <Td className="text-sm">{bucket.orders}</Td>
                    <Td className="text-sm">{peso(bucket.revenue)}</Td>
                    <Td className="text-sm">{peso(bucket.commission)}</Td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </Panel>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Top sellers" description="By gross revenue">
              {data.topSellers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No seller sales yet.
                </p>
              ) : (
                <AdminTable head={["Store", "Orders", "Revenue"]}>
                  {data.topSellers.map((seller) => (
                    <tr key={seller.id}>
                      <Td className="text-sm font-semibold">{seller.name}</Td>
                      <Td className="text-sm">{seller.orders}</Td>
                      <Td className="text-sm">{peso(seller.revenue)}</Td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </Panel>

            <Panel title="Top riders" description="By completed deliveries">
              {data.topRiders.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No deliveries yet.</p>
              ) : (
                <AdminTable head={["Rider", "Deliveries", "Earnings"]}>
                  {data.topRiders.map((rider) => (
                    <tr key={rider.id}>
                      <Td className="text-sm font-semibold">{shortId(rider.id)}</Td>
                      <Td className="text-sm">{rider.deliveries}</Td>
                      <Td className="text-sm">{peso(rider.earnings)}</Td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
