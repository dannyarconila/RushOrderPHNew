import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AdminTable,
  FilterBar,
  FilterChip,
  Pill,
  SearchBox,
  Td,
  dateTime,
  shortId,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { peso } from "@/lib/currency";
import {
  ORDER_STATUS_FILTERS,
  adminOrdersQuery,
  refundsQuery,
  type AdminOrderStatus,
} from "@/lib/admin/queries";

export const Route = createFileRoute("/internal-admin/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const [status, setStatus] = useState<AdminOrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const { data: orders, isLoading } = useQuery(adminOrdersQuery(status, 300));
  const { data: refunds } = useQuery(refundsQuery());

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return orders ?? [];
    return (orders ?? []).filter((o) =>
      [o.id, o.claim_number, o.stores?.name, o.customer_id].some((v) =>
        (v ?? "").toLowerCase().includes(term),
      ),
    );
  }, [orders, search]);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Monitor every order, its payment state and refund activity."
      />

      <Panel
        title={`${rows.length} orders`}
        description="Read-only monitoring view across all stores."
      >
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search order ID, claim number or store"
          />
          {ORDER_STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s.replace(/_/g, " ")}
            </FilterChip>
          ))}
        </FilterBar>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading orders…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No orders found"
            description="No orders match this filter yet."
          />
        ) : (
          <AdminTable head={["Order", "Store", "Placed", "Payment", "Total", "Status", ""]}>
            {rows.map((order) => (
              <tr key={order.id}>
                <Td>
                  <p className="font-semibold">{order.claim_number ?? shortId(order.id)}</p>
                  <p className="text-xs text-muted-foreground">{shortId(order.customer_id)}</p>
                </Td>
                <Td className="text-sm">{order.stores?.name ?? "—"}</Td>
                <Td className="text-xs text-muted-foreground">{dateTime(order.created_at)}</Td>
                <Td>
                  <p className="text-xs uppercase">{order.payment_method}</p>
                  <Pill tone={statusTone(order.payment_status)}>{order.payment_status}</Pill>
                </Td>
                <Td>
                  <p className="text-sm font-semibold">{peso(order.total)}</p>
                  <p className="text-xs text-muted-foreground">fee {peso(order.delivery_fee)}</p>
                </Td>
                <Td>
                  <Pill tone={statusTone(order.status)}>{order.status.replace(/_/g, " ")}</Pill>
                </Td>
                <Td>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/order/$orderId" params={{ orderId: order.id }}>
                      Open
                    </Link>
                  </Button>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <Panel
        title="Refunds"
        description="Refund transactions raised against orders."
        className="mt-6"
      >
        {(refunds ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No refunds recorded.</p>
        ) : (
          <AdminTable head={["Reference", "Order", "Amount", "Reason", "Status", "Created"]}>
            {(refunds ?? []).map((refund) => (
              <tr key={refund.id}>
                <Td className="text-sm font-semibold">{refund.reference}</Td>
                <Td className="text-xs text-muted-foreground">{shortId(refund.order_id)}</Td>
                <Td className="text-sm">{peso(refund.amount)}</Td>
                <Td className="text-xs text-muted-foreground">{refund.reason ?? "—"}</Td>
                <Td>
                  <Pill tone={statusTone(refund.status)}>{refund.status}</Pill>
                </Td>
                <Td className="text-xs text-muted-foreground">{dateTime(refund.created_at)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>
    </>
  );
}
