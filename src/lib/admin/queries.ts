/**
 * Admin read layer.
 *
 * All reads go through the `adminReadFn` server function, which authorizes the
 * internal admin session cookie and the role capability matrix before touching
 * the database. The browser never queries platform-wide data directly, so the
 * portal works independently of Supabase Auth roles.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/types";

import type { AdminReadInput } from "./contracts";
import { adminOverviewFn, adminReadFn, adminReportsFn } from "./data.functions";

type Tables = Database["public"]["Tables"];

export type ApplicationStatus = Database["public"]["Enums"]["application_status"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type AdminOrderStatus = Database["public"]["Enums"]["order_status"];

export type SellerApplicationRow = Tables["seller_applications"]["Row"];
export type RiderApplicationRow = Tables["rider_applications"]["Row"];
export type ProfileRow = Tables["profiles"]["Row"];
export type WalletRow = Tables["wallets"]["Row"];
export type WalletTxRow = Tables["wallet_transactions"]["Row"];
export type SettingRow = Tables["system_settings"]["Row"];
export type LegalDocumentRow = Tables["legal_documents"]["Row"];
export type LegalAcceptanceLogRow = Tables["legal_acceptance_logs"]["Row"];

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  "pending",
  "under_review",
  "approved",
  "rejected",
];

export const ORDER_STATUS_FILTERS: (AdminOrderStatus | "all")[] = [
  "all",
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
  "delivered",
  "cancelled",
];

/** Typed helper around the gated server read. */
async function read<T>(input: AdminReadInput): Promise<T[]> {
  const result = await adminReadFn({ data: input });
  return (result.rows ?? []) as T[];
}

export function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, raw]) => {
      if (raw == null) return acc;
      acc[key] = typeof raw === "string" ? raw : JSON.stringify(raw);
      return acc;
    },
    {},
  );
}

/** Storage paths found inside an application's `documents` JSON blob. */
export function documentEntries(value: unknown): { label: string; path: string }[] {
  return Object.entries(asRecord(value))
    .filter(([, path]) => Boolean(path))
    .map(([label, path]) => ({ label: label.replace(/_/g, " "), path }));
}

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export function sellerApplicationsQuery(status: ApplicationStatus | "all" = "all") {
  return queryOptions({
    queryKey: ["admin", "seller-applications", status],
    queryFn: () =>
      read<SellerApplicationRow>({
        table: "seller_applications",
        order: [{ column: "created_at", ascending: false }],
        filters: status === "all" ? [] : [{ column: "status", op: "eq", value: status }],
      }),
  });
}

export function riderApplicationsQuery(status: ApplicationStatus | "all" = "all") {
  return queryOptions({
    queryKey: ["admin", "rider-applications", status],
    queryFn: () =>
      read<RiderApplicationRow>({
        table: "rider_applications",
        order: [{ column: "created_at", ascending: false }],
        filters: status === "all" ? [] : [{ column: "status", op: "eq", value: status }],
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Members                                                             */
/* ------------------------------------------------------------------ */

export interface Member extends ProfileRow {
  roles: AppRole[];
}

/** Members holding a given role, hydrated with their profile row. */
export function membersByRoleQuery(role: AppRole) {
  return queryOptions({
    queryKey: ["admin", "members", role],
    queryFn: async (): Promise<Member[]> => {
      const roleRows = await read<{ user_id: string; role: AppRole }>({
        table: "user_roles",
        columns: "user_id,role",
        limit: 1000,
      });

      const byUser = new Map<string, AppRole[]>();
      for (const row of roleRows) {
        const list = byUser.get(row.user_id) ?? [];
        list.push(row.role);
        byUser.set(row.user_id, list);
      }

      const ids = [...byUser.entries()]
        .filter(([, roles]) => roles.includes(role))
        .map(([id]) => id);
      if (ids.length === 0) return [];

      const profiles = await read<ProfileRow>({
        table: "profiles",
        filters: [{ column: "id", op: "in", value: ids }],
        order: [{ column: "created_at", ascending: false }],
      });

      return profiles.map((profile) => ({ ...profile, roles: byUser.get(profile.id) ?? [] }));
    },
  });
}

export interface AdminStoreRow {
  id: string;
  owner_id: string;
  name: string;
  service_type: string;
  is_approved: boolean;
  is_active: boolean;
  is_online: boolean;
  verification_status: Database["public"]["Enums"]["store_verification_status"];
  rating: number;
  rating_count: number;
  created_at: string;
}

/** Stores owned by the given members, keyed by owner id. */
export function storesByOwnerQuery() {
  return queryOptions({
    queryKey: ["admin", "stores-by-owner"],
    queryFn: () =>
      read<AdminStoreRow>({
        table: "stores",
        columns:
          "id,owner_id,name,service_type,is_approved,is_active,is_online,verification_status,rating,rating_count,created_at",
        filters: [{ column: "deleted_at", op: "is_null" }],
        order: [{ column: "created_at", ascending: false }],
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

export interface AdminOrder {
  id: string;
  created_at: string;
  status: AdminOrderStatus;
  payment_status: Database["public"]["Enums"]["payment_status"];
  payment_method: Database["public"]["Enums"]["payment_method"];
  total: number;
  subtotal: number;
  delivery_fee: number;
  seller_commission: number;
  rider_commission: number;
  customer_id: string;
  rider_id: string | null;
  store_id: string | null;
  claim_number: string | null;
  stores: { name: string } | null;
}

const ORDER_FIELDS =
  "id,created_at,status,payment_status,payment_method,total,subtotal,delivery_fee,seller_commission,rider_commission,customer_id,rider_id,store_id,claim_number,stores(name)";

export function adminOrdersQuery(status: AdminOrderStatus | "all" = "all", limit = 200) {
  return queryOptions({
    queryKey: ["admin", "orders", status, limit],
    queryFn: () =>
      read<AdminOrder>({
        table: "orders",
        columns: ORDER_FIELDS,
        filters: [
          { column: "deleted_at", op: "is_null" },
          ...(status === "all" ? [] : [{ column: "status", op: "eq" as const, value: status }]),
        ],
        order: [{ column: "created_at", ascending: false }],
        limit,
      }),
  });
}

export type RefundRow = Tables["refund_transactions"]["Row"];

export function refundsQuery() {
  return queryOptions({
    queryKey: ["admin", "refunds"],
    queryFn: () =>
      read<RefundRow>({
        table: "refund_transactions",
        order: [{ column: "created_at", ascending: false }],
        limit: 100,
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Wallets                                                             */
/* ------------------------------------------------------------------ */

export function walletsQuery() {
  return queryOptions({
    queryKey: ["admin", "wallets"],
    queryFn: () =>
      read<WalletRow>({
        table: "wallets",
        filters: [{ column: "deleted_at", op: "is_null" }],
        order: [{ column: "balance", ascending: false }],
      }),
  });
}

export function walletLedgerQuery(kind: string | "all" = "all", limit = 200) {
  return queryOptions({
    queryKey: ["admin", "wallet-ledger", kind, limit],
    queryFn: () =>
      read<WalletTxRow>({
        table: "wallet_transactions",
        filters: kind === "all" ? [] : [{ column: "kind", op: "eq", value: kind }],
        order: [{ column: "created_at", ascending: false }],
        limit,
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function settingsQuery() {
  return queryOptions({
    queryKey: ["admin", "settings"],
    queryFn: () => read<SettingRow>({ table: "system_settings", order: [{ column: "key" }] }),
  });
}

export function legalDocumentsQuery() {
  return queryOptions({
    queryKey: ["admin", "legal-documents"],
    queryFn: () =>
      read<LegalDocumentRow>({
        table: "legal_documents",
        order: [{ column: "title", ascending: true }],
        limit: 200,
      }),
  });
}

export function legalAcceptanceLogsQuery(limit = 500) {
  return queryOptions({
    queryKey: ["admin", "legal-acceptance-logs", limit],
    queryFn: () =>
      read<LegalAcceptanceLogRow>({
        table: "legal_acceptance_logs",
        order: [{ column: "accepted_at", ascending: false }],
        limit,
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Dashboard overview + reports                                        */
/* ------------------------------------------------------------------ */

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

export function adminOverviewQuery() {
  return queryOptions({
    queryKey: ["admin", "overview"],
    staleTime: 30_000,
    queryFn: (): Promise<AdminOverview> => adminOverviewFn(),
  });
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

/** Sales, commission and leaderboard rollups for the trailing `days` window. */
export function adminReportsQuery(days = 90) {
  return queryOptions({
    queryKey: ["admin", "reports", days],
    staleTime: 60_000,
    queryFn: (): Promise<AdminReports> => adminReportsFn({ data: { days } }),
  });
}

/**
 * One-time admin bootstrap check for the legacy Supabase-auth admin role.
 *
 * Kept for compatibility with the public app's role checks; the internal portal
 * now authenticates through its own isolated account system.
 */
export function adminBootstrapQuery() {
  return queryOptions({
    queryKey: ["admin", "bootstrap-available"],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_bootstrap_available");
      if (error) throw error;
      return Boolean(data);
    },
  });
}
