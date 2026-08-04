/**
 * Shared, client-safe contracts for the Internal Admin Portal.
 *
 * This module is deliberately free of server imports and React so it can move
 * verbatim into a standalone admin app (e.g. admin.rushorderph.com) later.
 */

export type AdminRole = "super_admin" | "admin" | "finance" | "support";

export type AdminPermission =
  | "applications"
  | "members"
  | "orders"
  | "wallets"
  | "payments"
  | "reports"
  | "announcements"
  | "settings"
  | "admin_users"
  | "audit";

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "finance", "support"];

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  finance: "Finance",
  support: "Support",
};

/** Capability matrix. Super Admin implicitly holds every permission. */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    "applications",
    "members",
    "orders",
    "wallets",
    "payments",
    "reports",
    "announcements",
    "settings",
    "admin_users",
    "audit",
  ],
  admin: ["applications", "members", "orders", "wallets", "announcements"],
  finance: ["wallets", "payments", "reports"],
  support: ["members", "orders", "announcements"],
};

export function permissionsFor(role: AdminRole): AdminPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleCan(role: AdminRole, permission: AdminPermission): boolean {
  return permissionsFor(role).includes(permission);
}

export interface AdminSessionInfo {
  id: string;
  username: string;
  role: AdminRole;
  permissions: AdminPermission[];
  mustChangeCredentials: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  sessionTimeoutMinutes: number;
}

export interface AdminAccountSummary {
  id: string;
  username: string;
  role: AdminRole;
  is_active: boolean;
  must_change_credentials: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  locked_until: string | null;
  created_at: string;
}

export interface AdminAuditEntry {
  id: string;
  admin_username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, string | number | boolean | null>;
  ip_address: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Data access contracts                                               */
/* ------------------------------------------------------------------ */

export type AdminReadTable =
  | "seller_applications"
  | "rider_applications"
  | "profiles"
  | "user_roles"
  | "stores"
  | "orders"
  | "refund_transactions"
  | "wallets"
  | "wallet_transactions"
  | "wallet_topups"
  | "payment_methods"
  | "system_settings"
  | "legal_documents"
  | "legal_acceptance_logs"
  | "dispatch_jobs"
  | "dispatch_offers"
  | "rider_status";

/** Which permissions unlock a table read. */
export const READ_TABLE_PERMISSIONS: Record<AdminReadTable, AdminPermission[]> = {
  seller_applications: ["applications", "members"],
  rider_applications: ["applications", "members"],
  profiles: ["members", "orders", "wallets", "announcements"],
  user_roles: ["members", "orders", "wallets", "announcements", "reports"],
  stores: ["members", "orders", "reports", "applications"],
  orders: ["orders", "reports", "wallets"],
  refund_transactions: ["orders", "reports"],
  wallets: ["wallets", "reports", "members"],
  wallet_transactions: ["wallets", "reports"],
  wallet_topups: ["wallets", "payments"],
  payment_methods: ["payments", "wallets"],
  system_settings: ["settings", "payments", "wallets"],
  legal_documents: ["settings"],
  legal_acceptance_logs: ["settings", "reports"],
  dispatch_jobs: ["orders", "reports"],
  dispatch_offers: ["orders", "reports"],
  rider_status: ["orders", "members"],
};

export interface AdminReadFilter {
  column: string;
  op: "eq" | "in" | "gte" | "lte" | "is_null" | "not_null";
  value?: unknown;
}

export interface AdminReadInput {
  table: AdminReadTable;
  columns?: string;
  filters?: AdminReadFilter[];
  order?: { column: string; ascending?: boolean }[];
  limit?: number;
  countOnly?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AdminReadResult<T = Record<string, any>> {
  rows: T[];
  count: number | null;
}

export type AdminMutation =
  | {
      action: "set_application_status";
      kind: "seller" | "rider";
      id: string;
      status: string;
      notes?: string | null;
      approvalBonus?: number;
    }
  | { action: "set_store_verification"; storeId: string; status: string; notes?: string | null }
  | { action: "set_account_status"; userId: string; status: string; note?: string | null }
  | { action: "upsert_setting"; key: string; value: unknown }
  | { action: "notify"; userIds: string[]; title: string; body: string; kind?: string }
  | { action: "broadcast"; audiences: string[]; title: string; body: string }
  | { action: "save_payment_method"; input: Record<string, unknown> }
  | {
      action: "publish_legal_document";
      slug: string;
      title: string;
      summary: string;
      version: string;
      content: string;
      updatedBy: string;
      publishedAt: string;
      updatedAt: string;
    }
  | { action: "delete_payment_method"; id: string }
  | { action: "approve_topup"; id: string; notes?: string | null }
  | { action: "reject_topup"; id: string; reason: string }
  | {
      action: "adjust_wallet_balance";
      userId: string;
      amount: number;
      operation: "credit" | "debit";
      note?: string | null;
      walletType: "seller" | "rider" | "customer";
    };

export const DEFAULT_ADMIN_USERNAME = "Admin";
export const MIN_ADMIN_PASSWORD_LENGTH = 8;
export const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9._-]{4,32}$/;

export function validateAdminUsername(username: string): string | null {
  if (!ADMIN_USERNAME_PATTERN.test(username.trim())) {
    return "Username must be 4–32 characters (letters, numbers, dot, dash or underscore).";
  }
  return null;
}

export function validateAdminPassword(password: string): string | null {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain both letters and numbers.";
  }
  return null;
}
