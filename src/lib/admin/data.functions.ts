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

    /**
     * Enforce wallet minimums: toggle seller stores and rider presence based on
     * current balance and configured minimum for the role. Runs with the
     * service-role client so it has authority to update records atomically.
     */
    const enforceWalletState = async (userId: string, walletType: "seller" | "rider") => {
      // Read current balance
      const { data: walletRow, error: walletErr } = await supabaseAdmin
        .from("wallets")
        .select("id,balance,wallet_type")
        .eq("user_id", userId)
        .eq("wallet_type", walletType as never)
        .maybeSingle();
      if (walletErr) throw new Error(walletErr.message);
      const balance = Number(walletRow?.balance ?? 0);

      // Read required minimum using DB helper
      const { data: minVal, error: minErr } = await supabaseAdmin.rpc(
        "minimum_wallet_balance_for_role",
        { _role: walletType },
      );
      if (minErr) throw new Error(minErr.message);
      const required = Number(minVal ?? 0);

      if (walletType === "seller") {
        const shouldBeOnline = balance >= required;
        // Update all stores owned by this user to reflect wallet enforcement
        const { error: updateErr } = await supabaseAdmin
          .from("stores")
          .update({
            is_online: shouldBeOnline,
            wallet_hold: !shouldBeOnline,
            updated_at: new Date().toISOString(),
          })
          .eq("owner_id", userId);
        if (updateErr) throw new Error(updateErr.message);

        // Notify owner if state changed (best-effort)
        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: shouldBeOnline ? "Store restored online" : "Store taken offline",
            body: shouldBeOnline
              ? "Your store has been restored online after your wallet balance met the platform minimum."
              : "Your store has been taken offline because your wallet balance fell below the required minimum. Top up to resume receiving orders.",
            kind: "wallet",
          });
        } catch (e) {
          // swallow notification errors to avoid blocking the main operation
          console.error("notify-enforce-seller", e);
        }

        await mod.audit({
          account: await mod.requireReadyAdmin("wallets"),
          action: "wallet_enforcement",
          entityType: "stores",
          entityId: userId,
          details: { walletType, balance, required },
        });
      } else {
        // rider
        const shouldBeOnline = balance >= required;
        const { error: updateErr } = await supabaseAdmin
          .from("rider_status")
          .upsert(
            { user_id: userId, is_online: shouldBeOnline, last_seen_at: new Date().toISOString() },
            { onConflict: "user_id" },
          );
        if (updateErr) throw new Error(updateErr.message);

        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: shouldBeOnline ? "You are online" : "You went offline",
            body: shouldBeOnline
              ? "Your rider account is now online — your wallet balance meets the required minimum."
              : "Your rider account has been taken offline because your wallet balance fell below the required minimum. Top up to resume receiving dispatches.",
            kind: "wallet",
          });
        } catch (e) {
          console.error("notify-enforce-rider", e);
        }

        await mod.audit({
          account: await mod.requireReadyAdmin("wallets"),
          action: "wallet_enforcement",
          entityType: "rider_status",
          entityId: userId,
          details: { walletType, balance, required },
        });
      }
    };

    switch (data.action) {
      case "set_application_status": {
        const account = await requirePermission("applications");
        const table = data.kind === "seller" ? "seller_applications" : "rider_applications";

        const { data: previousApplication, error: previousError } = await supabaseAdmin
          .from(table)
          .select("status,user_id")
          .eq("id", data.id)
          .maybeSingle();
        if (previousError) throw new Error(previousError.message);
        if (!previousApplication) throw new Error("Application not found.");

        // Update the application status and notes
        const { error: updateError } = await supabaseAdmin
          .from(table)
          .update({
            status: data.status as never,
            review_notes: data.notes ?? null,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", data.id);
        if (updateError) throw new Error(updateError.message);

        // Audit the status change
        await mod.audit({
          account,
          action:
            data.kind === "seller" ? "seller_application_reviewed" : "rider_application_reviewed",
          entityType: table,
          entityId: data.id,
          details: { status: data.status },
        });

        // If approved, ensure the user has a wallet and credit the configurable welcome bonus.
        if (data.status === "approved" && previousApplication.status !== "approved") {
          // Fetch the application to obtain the user_id
          const { data: appRow, error: appError } = await supabaseAdmin
            .from(table)
            .select("user_id")
            .eq("id", data.id)
            .maybeSingle();
          if (appError) throw new Error(appError.message);
          const userId: string | undefined = appRow?.user_id;
          if (userId) {
            const walletType = data.kind === "seller" ? "seller" : "rider";

            // Ensure a wallet row exists for this user
            const { data: existingWallet, error: walletSelectError } = await supabaseAdmin
              .from("wallets")
              .select("id,balance")
              .eq("user_id", userId)
              .eq("wallet_type", walletType as never)
              .maybeSingle();
            if (walletSelectError) throw new Error(walletSelectError.message);

            let walletId: string;
            let currentBalance = 0;
            if (!existingWallet) {
              const { data: insertWallet, error: insertError } = await supabaseAdmin
                .from("wallets")
                .insert({ user_id: userId, wallet_type: walletType })
                .select("id,balance")
                .maybeSingle();
              if (insertError) throw new Error(insertError.message);
              if (!insertWallet) throw new Error("Wallet creation returned no record.");
              walletId = insertWallet.id;
              currentBalance = Number(insertWallet.balance ?? 0);
            } else {
              walletId = existingWallet.id;
              currentBalance = Number(existingWallet.balance ?? 0);
            }

            // Read configured welcome bonus from system settings
            const { data: settingRow, error: settingError } = await supabaseAdmin
              .from("system_settings")
              .select("value")
              .eq("key", "welcome_wallet_bonus")
              .maybeSingle();
            if (settingError) throw new Error(settingError.message);

            const rawWelcomeAmount = settingRow?.value;
            const configuredAmount =
              typeof rawWelcomeAmount === "number"
                ? rawWelcomeAmount
                : Number(rawWelcomeAmount ?? 0) || 0;
            const requestedAmount = Number(data.approvalBonus);
            const welcomeAmount = Number.isFinite(requestedAmount)
              ? Math.max(0, requestedAmount)
              : configuredAmount;

            if (welcomeAmount > 0) {
              const newBalance = currentBalance + welcomeAmount;
              const { error: walletUpdateError } = await supabaseAdmin
                .from("wallets")
                .update({ balance: newBalance })
                .eq("id", walletId);
              if (walletUpdateError) throw new Error(walletUpdateError.message);

              // Insert a wallet transaction record
              const { error: txError } = await supabaseAdmin.from("wallet_transactions").insert({
                wallet_id: walletId,
                amount: welcomeAmount,
                kind: "welcome",
                description: "Welcome Credit",
              });
              if (txError) throw new Error(txError.message);

              // Notify the user
              const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
                user_id: userId,
                title: "Welcome Credit",
                body: `A welcome credit of ₱${welcomeAmount.toFixed(2)} has been added to your wallet.`,
                kind: "wallet",
              });
              if (notifyError) throw new Error(notifyError.message);

              await mod.audit({
                account,
                action: "welcome_credit_awarded",
                entityType: "wallets",
                entityId: walletId,
                details: { amount: welcomeAmount, for: walletType },
              });

              // Enforce wallet-driven online/offline state now the welcome credit has been applied.
              try {
                await enforceWalletState(userId, walletType as "seller" | "rider");
              } catch (e) {
                console.error("enforce-after-welcome", e);
              }
            }
          }
        }

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
        const seededSettingDefaults: Record<string, { description: string; is_public: boolean }> = {
          marketplace_customer_radius_km: {
            description:
              "Maximum distance in kilometers for showing stores in customer marketplace results.",
            is_public: true,
          },
        };

        const defaults = seededSettingDefaults[data.key] ?? null;
        const payload = {
          key: data.key,
          value: data.value as never,
          ...(defaults
            ? {
                description: defaults.description,
                is_public: defaults.is_public,
              }
            : {}),
        };

        const { error } = await supabaseAdmin
          .from("system_settings")
          .upsert(payload as never, { onConflict: "key" });
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

      case "publish_legal_document": {
        const account = await requirePermission("settings");

        const { error: docError } = await supabaseAdmin.from("legal_documents").upsert(
          {
            slug: data.slug,
            title: data.title,
            summary: data.summary,
            content: data.content,
            version: data.version,
            is_published: true,
            published_at: data.publishedAt,
            updated_at: data.updatedAt,
            updated_by: account.id,
          },
          { onConflict: "slug" },
        );
        if (docError) throw new Error(docError.message);

        const payload = {
          version: data.version,
          publishedAt: data.publishedAt,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
          content: data.content,
        };

        const docKey = `legal_doc_${data.slug}`;
        const { error: settingError } = await supabaseAdmin.from("system_settings").upsert(
          {
            key: docKey,
            value: payload as never,
            description: `Legal document payload for ${data.slug}`,
            is_public: true,
          },
          { onConflict: "key" },
        );
        if (settingError) throw new Error(settingError.message);

        const versionSettingKeyBySlug: Record<string, string> = {
          "terms-conditions": "legal_terms_version",
          "privacy-policy": "legal_privacy_version",
          "seller-terms-conditions": "legal_seller_terms_version",
          "rider-terms-conditions": "legal_rider_terms_version",
        };
        const versionSettingKey = versionSettingKeyBySlug[data.slug];

        if (versionSettingKey) {
          const { error: versionError } = await supabaseAdmin.from("system_settings").upsert(
            {
              key: versionSettingKey,
              value: data.version as never,
              description: `Current version for ${data.slug}`,
              is_public: true,
            },
            { onConflict: "key" },
          );
          if (versionError) throw new Error(versionError.message);
        }

        await mod.audit({
          account,
          action: "legal_document_published",
          entityType: "legal_documents",
          entityId: data.slug,
          details: { version: data.version },
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

        // Fetch the topup row to find which wallet and user were affected so we can enforce wallet state.
        const { data: topupRow, error: topupErr } = await supabaseAdmin
          .from("wallet_topups")
          .select("user_id,wallet_type")
          .eq("id", data.id)
          .maybeSingle();
        if (topupErr) throw new Error(topupErr.message);

        await mod.audit({
          account,
          action: "wallet_topup_approved",
          entityType: "wallet_topups",
          entityId: data.id,
        });

        if (topupRow?.user_id && topupRow?.wallet_type) {
          try {
            await enforceWalletState(topupRow.user_id, topupRow.wallet_type as "seller" | "rider");
          } catch (e) {
            console.error("enforce-after-topup", e);
          }
        }

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

        // Enforce wallet-driven online/offline state after an admin adjustment.
        try {
          await enforceWalletState(data.userId, data.walletType);
        } catch (e) {
          console.error("enforce-after-adjust", e);
        }

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
