/**
 * Admin write layer.
 *
 * Every mutation is dispatched to the `adminMutateFn` server function, which
 * authorizes the internal admin session and the role capability matrix, writes
 * with the service-role client and records an audit entry. No React imports,
 * so a future standalone portal can reuse this verbatim.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/types";

import { adminMutateFn } from "./data.functions";
import type { AccountStatus, ApplicationStatus } from "./queries";

type StoreVerificationStatus = Database["public"]["Enums"]["store_verification_status"];

export async function setSellerApplicationStatus(input: {
  id: string;
  status: ApplicationStatus;
  notes?: string | null;
  approvalBonus?: number;
}) {
  await adminMutateFn({
    data: {
      action: "set_application_status",
      kind: "seller",
      id: input.id,
      status: input.status,
      notes: input.notes,
      approvalBonus: input.approvalBonus,
    },
  });
}

export async function setRiderApplicationStatus(input: {
  id: string;
  status: ApplicationStatus;
  notes?: string | null;
  approvalBonus?: number;
}) {
  await adminMutateFn({
    data: {
      action: "set_application_status",
      kind: "rider",
      id: input.id,
      status: input.status,
      notes: input.notes,
      approvalBonus: input.approvalBonus,
    },
  });
}

/** Verify, suspend or reject a storefront. The owner is notified automatically. */
export async function setStoreVerification(input: {
  storeId: string;
  status: StoreVerificationStatus;
  notes?: string | null;
}) {
  await adminMutateFn({
    data: {
      action: "set_store_verification",
      storeId: input.storeId,
      status: input.status,
      notes: input.notes,
    },
  });
}

/** Suspend, ban or reactivate any member account. */
export async function setAccountStatus(input: {
  userId: string;
  status: AccountStatus;
  note?: string | null;
}) {
  await adminMutateFn({
    data: {
      action: "set_account_status",
      userId: input.userId,
      status: input.status,
      note: input.note,
    },
  });
}

export async function upsertSetting(input: { key: string; value: unknown }) {
  await adminMutateFn({ data: { action: "upsert_setting", key: input.key, value: input.value } });
}

export async function notifyUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  kind?: string;
}) {
  if (input.userIds.length === 0) return 0;
  const result = await adminMutateFn({
    data: {
      action: "notify",
      userIds: input.userIds,
      title: input.title,
      body: input.body,
      kind: input.kind,
    },
  });
  return result.affected ?? input.userIds.length;
}

/** Broadcast an announcement to every member holding any of the given roles. */
export async function broadcastAnnouncement(input: {
  audiences: AppRole[];
  title: string;
  body: string;
}) {
  const result = await adminMutateFn({
    data: { action: "broadcast", audiences: input.audiences, title: input.title, body: input.body },
  });
  return result.affected ?? 0;
}

/**
 * Claim the very first Supabase-auth administrator (legacy public-app role).
 * The internal portal has its own isolated account system.
 */
export async function claimFirstAdmin() {
  const { error } = await supabase.rpc("claim_first_admin");
  if (error) throw error;
}

export async function adjustWalletBalance(input: {
  userId: string;
  amount: number;
  walletType: "seller" | "rider" | "customer";
  operation: "credit" | "debit";
  note?: string | null;
}) {
  await adminMutateFn({
    data: {
      action: "adjust_wallet_balance",
      userId: input.userId,
      walletType: input.walletType,
      amount: input.amount,
      operation: input.operation,
      note: input.note,
    },
  });
}
