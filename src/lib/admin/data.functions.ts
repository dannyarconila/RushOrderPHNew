/**
 * Internal Admin Portal — data access server functions.
 *
 * Every read and write is authorized server-side against the admin session
 * cookie and the role capability matrix before the service-role client is
 * touched. The browser never receives a privileged Supabase client.
 */
import { createServerFn } from "@tanstack/react-start";

import type { AdminMutation, AdminReadInput, AdminReadResult } from "./contracts";
import type { AdminOverview, AdminReports } from "./analytics.server";

export const adminReadFn = createServerFn({ method: "POST" })
  .inputValidator((data: AdminReadInput) => data)
  .handler(async ({ data }): Promise<AdminReadResult> => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const allowed = contracts.READ_TABLE_PERMISSIONS[data.table];
    if (!allowed) throw new Error("Unknown data source.");

    const account = await mod.requireReadyAdmin();
    const permissions = contracts.permissionsFor(account.role);
    if (!allowed.some((permission) => permissions.includes(permission))) {
      throw new Error("Your administrator role does not allow this action.");
    }

    let query = supabaseAdmin
      .from(data.table)
      .select(data.columns ?? "*", data.countOnly ? { count: "exact", head: true } : undefined);

    for (const filter of data.filters ?? []) {
      switch (filter.op) {
        case "eq":
          query = query.eq(filter.column, filter.value as never);
          break;
        case "in":
          query = query.in(filter.column, (filter.value ?? []) as never[]);
          break;
        case "gte":
          query = query.gte(filter.column, filter.value as never);
          break;
        case "lte":
          query = query.lte(filter.column, filter.value as never);
          break;
        case "is_null":
          query = query.is(filter.column, null);
          break;
        case "not_null":
          query = query.not(filter.column, "is", null);
          break;
        default:
          throw new Error("Unsupported filter.");
      }
    }

    for (const order of data.order ?? []) {
      query = query.order(order.column, { ascending: order.ascending ?? true });
    }
    if (data.limit) query = query.limit(Math.min(data.limit, 1000));

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as never[], count: count ?? null };
  });

export const adminMutateFn = createServerFn({ method: "POST" })
  .inputValidator((data: AdminMutation) => data)
  .handler(async ({ data }): Promise<{ ok: true; affected?: number }> => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const requirePermission = async (permission: Parameters<typeof mod.requireReadyAdmin>[0]) =>
      mod.requireReadyAdmin(permission);

    switch (data.action) {
      case "set_application_status": {
        const account = await requirePermission("applications");
        const table = data.kind === "seller" ? "seller_applications" : "rider_applications";
        const { error } = await supabaseAdmin
          .from(table)
          .update({ status: data.status as never, review_notes: data.notes ?? null })
          .eq("id", data.id);
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action:
            data.kind === "seller" ? "seller_application_reviewed" : "rider_application_reviewed",
          entityType: table,
          entityId: data.id,
          details: { status: data.status },
        });
        return { ok: true };
      }

      case "set_store_verification": {
        const account = await requirePermission("members");
        const { error } = await supabaseAdmin.rpc("admin_portal_set_store_verification", {
          _store_id: data.storeId,
          _status: data.status as never,
          _notes: data.notes ?? undefined,
        });
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: "store_verification_changed",
          entityType: "stores",
          entityId: data.storeId,
          details: { status: data.status },
        });
        return { ok: true };
      }

      case "set_account_status": {
        const account = await requirePermission("members");
        const { error } = await supabaseAdmin.rpc("admin_portal_set_account_status", {
          _user_id: data.userId,
          _status: data.status as never,
          _note: data.note ?? undefined,
        });
        if (error) throw new Error(error.message);

        const titles: Record<string, string> = {
          active: "Your account has been reactivated",
          suspended: "Your account has been suspended",
          banned: "Your account has been banned",
        };
        await supabaseAdmin.from("notifications").insert({
          user_id: data.userId,
          title: titles[data.status] ?? "Your account status changed",
          body: data.note ?? "Contact RushOrder PH support if you believe this is a mistake.",
          kind: "account",
        });
        await mod.audit({
          account,
          action: "member_status_changed",
          entityType: "profiles",
          entityId: data.userId,
          details: { status: data.status },
        });
        return { ok: true };
      }

      case "upsert_setting": {
        const account = await requirePermission("settings");
        const { error } = await supabaseAdmin
          .from("system_settings")
          .update({ value: data.value as never })
          .eq("key", data.key);
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: "setting_changed",
          entityType: "system_settings",
          entityId: data.key,
          details: { key: data.key },
        });
        return { ok: true };
      }

      case "notify":
      case "broadcast": {
        const account = await requirePermission("announcements");
        let userIds: string[];
        if (data.action === "notify") {
          userIds = data.userIds;
        } else {
          if (data.audiences.length === 0) throw new Error("Pick at least one audience.");
          const { data: rows, error } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .in("role", data.audiences as never[]);
          if (error) throw new Error(error.message);
          userIds = [...new Set((rows ?? []).map((row) => row.user_id))];
        }
        if (userIds.length === 0) return { ok: true, affected: 0 };

        const { error: insertError } = await supabaseAdmin.from("notifications").insert(
          userIds.map((user_id) => ({
            user_id,
            title: data.title,
            body: data.body,
            kind: data.action === "notify" ? (data.kind ?? "announcement") : "announcement",
          })),
        );
        if (insertError) throw new Error(insertError.message);
        await mod.audit({
          account,
          action: "announcement_sent",
          entityType: "notifications",
          details: { recipients: userIds.length, title: data.title },
        });
        return { ok: true, affected: userIds.length };
      }

      case "save_payment_method": {
        const account = await requirePermission("payments");
        const input = data.input as { id?: string } & Record<string, unknown>;
        const payload = { ...input };
        delete payload.id;
        const { error } = input.id
          ? await supabaseAdmin
              .from("payment_methods")
              .update(payload as never)
              .eq("id", input.id)
          : await supabaseAdmin.from("payment_methods").insert(payload as never);
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: input.id ? "payment_method_updated" : "payment_method_created",
          entityType: "payment_methods",
          entityId: input.id ?? null,
          details: { name: String(input.name ?? "") },
        });
        return { ok: true };
      }

      case "delete_payment_method": {
        const account = await requirePermission("payments");
        const { error } = await supabaseAdmin.from("payment_methods").delete().eq("id", data.id);
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: "payment_method_deleted",
          entityType: "payment_methods",
          entityId: data.id,
        });
        return { ok: true };
      }

      case "approve_topup": {
        const account = await requirePermission("wallets");
        const { error } = await supabaseAdmin.rpc("admin_portal_approve_topup", {
          _topup_id: data.id,
          _notes: data.notes ?? undefined,
        });
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: "wallet_topup_approved",
          entityType: "wallet_topups",
          entityId: data.id,
        });
        return { ok: true };
      }

      case "reject_topup": {
        const account = await requirePermission("wallets");
        if (!data.reason.trim()) throw new Error("A rejection reason is required.");
        const { error } = await supabaseAdmin.rpc("admin_portal_reject_topup", {
          _topup_id: data.id,
          _reason: data.reason.trim(),
        });
        if (error) throw new Error(error.message);
        await mod.audit({
          account,
          action: "wallet_topup_rejected",
          entityType: "wallet_topups",
          entityId: data.id,
          details: { reason: data.reason.trim() },
        });
        return { ok: true };
      }

      case "adjust_wallet_balance": {
        const account = await requirePermission("wallets");

        const { data: wallet, error: walletError } = await supabaseAdmin
          .from("wallets")
          .select("id,balance")
          .eq("user_id", data.userId)
          .eq("wallet_type", data.walletType as never)
          .single();

        if (walletError) throw new Error(walletError.message);

        const currentBalance = Number(wallet.balance ?? 0);

        const newBalance =
          data.operation === "credit"
            ? currentBalance + Number(data.amount)
            : Math.max(0, currentBalance - Number(data.amount));

        const { error: updateError } = await supabaseAdmin
          .from("wallets")
          .update({ balance: newBalance })
          .eq("id", wallet.id);

        if (updateError) throw new Error(updateError.message);

        await supabaseAdmin.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          amount: Number(data.amount),
          kind: "adjustment",
          description: data.note ?? "Admin wallet adjustment",
        });

        await supabaseAdmin.from("notifications").insert({
          user_id: data.userId,
          title: data.operation === "credit" ? "Wallet Credited" : "Wallet Deducted",
          body:
            data.note ??
            `Administrator ${data.operation === "credit" ? "added" : "deducted"} ₱${Number(data.amount).toFixed(2)} to your wallet.`,
          kind: "wallet",
        });

        await mod.audit({
          account,
          action: "wallet_adjustment",
          entityType: "wallet",
          entityId: wallet.id,
          details: {
            operation: data.operation,
            amount: data.amount,
            balance: newBalance,
          },
        });

        return { ok: true };
      }

      default:
        throw new Error("Unsupported administrator action.");
    }
  });

export const adminOverviewFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminOverview> => {
    const mod = await import("./auth.server");
    const analytics = await import("./analytics.server");
    await mod.requireReadyAdmin();
    return analytics.buildOverview();
  },
);

export const adminReportsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { days?: number } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<AdminReports> => {
    const mod = await import("./auth.server");
    const analytics = await import("./analytics.server");
    await mod.requireReadyAdmin("reports");
    return analytics.buildReports(Math.min(Math.max(data.days ?? 90, 1), 365));
  });

/** Signed URL for a private bucket object, viewable only by an authorized admin. */
export const adminSignedUrlFn = createServerFn({ method: "POST" })
  .inputValidator((data: { bucket: string; path: string }) => data)
  .handler(async ({ data }): Promise<string | null> => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await mod.requireReadyAdmin();
    const { data: signed } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 60 * 60);
    return signed?.signedUrl ?? null;
  });

/** Upload a small asset (e.g. payment QR) to a private bucket as an admin. */
export const adminUploadFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { bucket: string; path: string; contentType: string; base64: string }) => data,
  )
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const account = await mod.requireReadyAdmin("payments");

    const binary = Uint8Array.from(atob(data.base64), (char) => char.charCodeAt(0));
    if (binary.byteLength > 5 * 1024 * 1024) throw new Error("File must be 5 MB or smaller.");

    const { error } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(data.path, binary, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    await mod.audit({
      account,
      action: "admin_asset_uploaded",
      entityType: data.bucket,
      details: { path: data.path },
    });
    return { path: data.path };
  });
