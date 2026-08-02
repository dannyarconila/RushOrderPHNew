/**
 * Wallet + manual top-up service layer.
 *
 * Phase 1 is a manual flow: the customer pays through an admin-configured
 * payment method (QR / account number), uploads proof, and an administrator
 * approves the request. Approval is done entirely in the database
 * (`approve_wallet_topup`), which credits the wallet, writes the ledger row and
 * notifies the user atomically.
 *
 * Phase 2 (automatic gateways: PayMongo, Xendit, GCash Business, …) only needs
 * to create a `wallet_topups` row and call the same approval RPC from a
 * verified webhook — no UI or wallet schema change required.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

import { adminMutateFn, adminReadFn } from "./admin/data.functions";

type Tables = Database["public"]["Tables"];

export type WalletType = Database["public"]["Enums"]["wallet_type"];
export type TopupStatus = Database["public"]["Enums"]["topup_status"];
export type PaymentMethodRow = Tables["payment_methods"]["Row"];
export type TopupRow = Tables["wallet_topups"]["Row"];
export type WalletRow = Tables["wallets"]["Row"];
export type WalletTxRow = Tables["wallet_transactions"]["Row"];

export const TOPUP_STATUSES: TopupStatus[] = ["pending", "approved", "rejected", "cancelled"];

export const MIN_TOPUP = 50;
export const MAX_TOPUP = 100_000;

/* ------------------------------------------------------------------ */
/* Payment methods                                                     */
/* ------------------------------------------------------------------ */

/** Active methods only — what a seller/rider may pay with right now. */
export function activePaymentMethodsQuery() {
  return queryOptions({
    queryKey: ["payment-methods", "active"],
    queryFn: async (): Promise<PaymentMethodRow[]> => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("is_active", true)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Every method, including inactive ones (internal admin portal only). */
export function allPaymentMethodsQuery() {
  return queryOptions({
    queryKey: ["payment-methods", "all"],
    queryFn: async (): Promise<PaymentMethodRow[]> => {
      const { rows } = await adminReadFn({
        data: {
          table: "payment_methods",
          order: [{ column: "sort_order" }, { column: "name" }],
        },
      });
      return rows as PaymentMethodRow[];
    },
  });
}

export interface PaymentMethodInput {
  id?: string;
  code: string;
  name: string;
  account_name: string | null;
  account_number: string | null;
  qr_image_path: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
}

export async function savePaymentMethod(input: PaymentMethodInput) {
  const payload = {
    code: input.code.trim().toLowerCase().replace(/\s+/g, "_"),
    name: input.name.trim(),
    account_name: input.account_name?.trim() || null,
    account_number: input.account_number?.trim() || null,
    qr_image_path: input.qr_image_path || null,
    instructions: input.instructions?.trim() || null,
    is_active: input.is_active,
    sort_order: input.sort_order,
  };
  if (!payload.name) throw new Error("Payment method name is required.");
  if (!payload.code) throw new Error("Payment method code is required.");

  await adminMutateFn({
    data: {
      action: "save_payment_method",
      input: { ...payload, ...(input.id ? { id: input.id } : {}) },
    },
  });
}

export async function deletePaymentMethod(id: string) {
  await adminMutateFn({ data: { action: "delete_payment_method", id } });
}

/* ------------------------------------------------------------------ */
/* Wallet reads (owner scoped — RLS keeps them to the caller)          */
/* ------------------------------------------------------------------ */

export function myWalletQuery(userId: string | undefined, walletType: WalletType) {
  return queryOptions({
    queryKey: ["wallet", walletType, userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<WalletRow | null> => {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId!)
        .eq("wallet_type", walletType)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function myWalletTransactionsQuery(walletId: string | undefined, limit = 50) {
  return queryOptions({
    queryKey: ["wallet-transactions", walletId ?? null, limit],
    enabled: Boolean(walletId),
    queryFn: async (): Promise<WalletTxRow[]> => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("wallet_id", walletId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function myTopupsQuery(userId: string | undefined, walletType: WalletType) {
  return queryOptions({
    queryKey: ["wallet-topups", "mine", walletType, userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<TopupRow[]> => {
      const { data, error } = await supabase
        .from("wallet_topups")
        .select("*")
        .eq("user_id", userId!)
        .eq("wallet_type", walletType)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ------------------------------------------------------------------ */
/* Top-up submission (owner)                                           */
/* ------------------------------------------------------------------ */

export interface SubmitTopupInput {
  userId: string;
  walletType: WalletType;
  method: PaymentMethodRow;
  amount: number;
  referenceNumber: string;
  proofPath: string | null;
}

export async function submitTopup(input: SubmitTopupInput) {
  if (!Number.isFinite(input.amount) || input.amount < MIN_TOPUP) {
    throw new Error(`Minimum top-up amount is ₱${MIN_TOPUP}.`);
  }
  if (input.amount > MAX_TOPUP) {
    throw new Error(`Maximum top-up amount is ₱${MAX_TOPUP.toLocaleString("en-PH")}.`);
  }
  if (!input.referenceNumber.trim()) throw new Error("Enter the payment reference number.");
  if (!input.proofPath) throw new Error("Upload a screenshot of your payment receipt.");

  const { error } = await supabase.from("wallet_topups").insert({
    user_id: input.userId,
    wallet_type: input.walletType,
    payment_method_id: input.method.id,
    payment_method_name: input.method.name,
    amount: input.amount,
    reference_number: input.referenceNumber.trim(),
    proof_path: input.proofPath,
  });
  if (error) throw error;
}

/** Owners may withdraw a request while it is still pending. */
export async function cancelTopup(id: string) {
  const { error } = await supabase
    .from("wallet_topups")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Admin review                                                        */
/* ------------------------------------------------------------------ */

export function adminTopupsQuery(status: TopupStatus | "all" = "pending", limit = 200) {
  return queryOptions({
    queryKey: ["admin", "topups", status, limit],
    queryFn: async (): Promise<TopupRow[]> => {
      const { rows } = await adminReadFn({
        data: {
          table: "wallet_topups",
          filters: status === "all" ? [] : [{ column: "status", op: "eq", value: status }],
          order: [{ column: "created_at", ascending: false }],
          limit,
        },
      });
      return rows as TopupRow[];
    },
  });
}

/** Credits the wallet, writes the ledger row and notifies — all in the DB. */
export async function approveTopup(input: { id: string; notes?: string | null }) {
  await adminMutateFn({ data: { action: "approve_topup", id: input.id, notes: input.notes } });
}

export async function rejectTopup(input: { id: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("A rejection reason is required.");
  await adminMutateFn({
    data: { action: "reject_topup", id: input.id, reason: input.reason.trim() },
  });
}
