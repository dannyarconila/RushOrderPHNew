/**
 * Server-only analytics for the Internal Admin Portal.
 * Aggregations run with the service-role client after the caller has been
 * authorized by `requireAdmin`, so no raw platform data reaches the browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AdminOverview {
  pendingSellerApps: number;
  pendingRiderApps: number;
  customers: number;
  sellers: number;
  riders: number;
  activeOrders: number;
  ordersToday: number;
  revenueToday: number;
  revenueMonth: number;
  commissionMonth: number;
  walletBalance: number;
  walletPending: number;
  walletCount: number;
}

export interface SalesBucket {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  commission: number;
}

export interface AdminReports {
  daily: SalesBucket[];
  weekly: SalesBucket[];
  monthly: SalesBucket[];
  topSellers: { id: string; name: string; orders: number; revenue: number }[];
  topRiders: { id: string; deliveries: number; earnings: number }[];
  totals: { orders: number; revenue: number; commission: number };
}

const ACTIVE_ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "picked_up"] as const;

export async function buildOverview(): Promise<AdminOverview> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const countApplications = async (table: "seller_applications" | "rider_applications") => {
    const { count } = await supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "under_review"]);
    return count ?? 0;
  };

  const [pendingSellerApps, pendingRiderApps] = await Promise.all([
    countApplications("seller_applications"),
    countApplications("rider_applications"),
  ]);

  const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role");
  const roleCount = (role: string) => (roleRows ?? []).filter((r) => r.role === role).length;

  const { count: activeOrders } = await supabaseAdmin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .in("status", [...ACTIVE_ORDER_STATUSES])
    .is("deleted_at", null);

  const { data: monthOrders } = await supabaseAdmin
    .from("orders")
    .select("created_at,total,seller_commission,rider_commission,status")
    .gte("created_at", startOfMonth.toISOString())
    .is("deleted_at", null);

  const billable = (monthOrders ?? []).filter(
    (o) =>
      o.status === "delivered" && !["failed", "expired", "refunded"].includes(o.payment_status),
  );
  const todays = billable.filter((o) => new Date(o.created_at) >= startOfDay);

  const { data: wallets } = await supabaseAdmin
    .from("wallets")
    .select("balance,pending_balance")
    .is("deleted_at", null);

  return {
    pendingSellerApps,
    pendingRiderApps,
    customers: roleCount("customer"),
    sellers: roleCount("seller"),
    riders: roleCount("rider"),
    activeOrders: activeOrders ?? 0,
    ordersToday: todays.length,
    revenueToday: todays.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
    revenueMonth: billable.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
    commissionMonth: billable.reduce(
      (sum, o) => sum + Number(o.seller_commission ?? 0) + Number(o.rider_commission ?? 0),
      0,
    ),
    walletBalance: (wallets ?? []).reduce((sum, w) => sum + Number(w.balance ?? 0), 0),
    walletPending: (wallets ?? []).reduce((sum, w) => sum + Number(w.pending_balance ?? 0), 0),
    walletCount: (wallets ?? []).length,
  };
}

const isoWeek = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

export async function buildReports(days: number): Promise<AdminReports> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id,created_at,status,total,seller_commission,rider_commission,store_id,rider_id,stores(name)",
    )
    .gte("created_at", since)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const rows = (data ?? []).filter(
    (o) =>
      o.status === "delivered" && !["failed", "expired", "refunded"].includes(o.payment_status),
  );

  const bucket = (keyFn: (d: Date) => string, labelFn: (d: Date) => string) => {
    const map = new Map<string, SalesBucket>();
    for (const row of rows) {
      const d = new Date(row.created_at);
      const key = keyFn(d);
      const entry = map.get(key) ?? {
        key,
        label: labelFn(d),
        orders: 0,
        revenue: 0,
        commission: 0,
      };
      entry.orders += 1;
      entry.revenue += Number(row.total ?? 0);
      entry.commission += Number(row.seller_commission ?? 0) + Number(row.rider_commission ?? 0);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  };

  const sellerMap = new Map<
    string,
    { id: string; name: string; orders: number; revenue: number }
  >();
  const riderMap = new Map<string, { id: string; deliveries: number; earnings: number }>();
  for (const row of rows) {
    if (row.store_id) {
      const entry = sellerMap.get(row.store_id) ?? {
        id: row.store_id,
        name: (row.stores as { name: string } | null)?.name ?? "Unnamed store",
        orders: 0,
        revenue: 0,
      };
      entry.orders += 1;
      entry.revenue += Number(row.total ?? 0);
      sellerMap.set(row.store_id, entry);
    }
    if (row.rider_id) {
      const entry = riderMap.get(row.rider_id) ?? { id: row.rider_id, deliveries: 0, earnings: 0 };
      entry.deliveries += 1;
      entry.earnings += Number(row.rider_commission ?? 0);
      riderMap.set(row.rider_id, entry);
    }
  }

  return {
    daily: bucket(
      (d) => d.toISOString().slice(0, 10),
      (d) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
    ).slice(0, 14),
    weekly: bucket(
      isoWeek,
      (d) => `Week of ${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`,
    ).slice(0, 8),
    monthly: bucket(
      (d) => d.toISOString().slice(0, 7),
      (d) => d.toLocaleDateString("en-PH", { month: "long", year: "numeric" }),
    ).slice(0, 6),
    topSellers: [...sellerMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    topRiders: [...riderMap.values()].sort((a, b) => b.deliveries - a.deliveries).slice(0, 8),
    totals: {
      orders: rows.length,
      revenue: rows.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
      commission: rows.reduce(
        (sum, o) => sum + Number(o.seller_commission ?? 0) + Number(o.rider_commission ?? 0),
        0,
      ),
    },
  };
}
