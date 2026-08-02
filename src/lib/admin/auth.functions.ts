/**
 * Internal Admin Portal — authentication server functions.
 *
 * Thin RPC wrappers only; all logic lives in `auth.server.ts`, which is loaded
 * inside the handlers so the service-role client never reaches the browser.
 */
import { createServerFn } from "@tanstack/react-start";

import type {
  AdminAccountSummary,
  AdminAuditEntry,
  AdminRole,
  AdminSessionInfo,
} from "./contracts";

export const adminSessionInfoFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminSessionInfo | null> => {
    const mod = await import("./auth.server");
    try {
      const account = await mod.requireAdmin();
      return mod.toSessionInfo(account, await mod.sessionTimeoutMinutes());
    } catch {
      return null;
    }
  },
);

export const adminLoginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }): Promise<AdminSessionInfo> => {
    const mod = await import("./auth.server");
    if (!data.username?.trim() || !data.password)
      throw new Error("Enter your username and password.");
    const account = await mod.attemptLogin(data.username, data.password);
    return mod.toSessionInfo(account, await mod.sessionTimeoutMinutes());
  });

export const adminLogoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const mod = await import("./auth.server");
  const session = await mod.adminSession();
  const adminId = session.data.adminId;
  if (adminId) {
    const account = await mod.findAccountById(adminId);
    await mod.audit({ account, action: "admin_logout" });
  }
  await session.clear();
  return { ok: true as const };
});

/** First-login security setup: replaces the default credentials permanently. */
export const adminCompleteSetupFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string; confirmPassword: string }) => data)
  .handler(async ({ data }): Promise<AdminSessionInfo> => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const account = await mod.requireAdmin();
    if (!account.must_change_credentials)
      throw new Error("Security setup has already been completed.");

    const username = data.username.trim();
    if (data.password !== data.confirmPassword) throw new Error("Passwords do not match.");
    const usernameError = contracts.validateAdminUsername(username);
    if (usernameError) throw new Error(usernameError);
    const passwordError = contracts.validateAdminPassword(data.password);
    if (passwordError) throw new Error(passwordError);
    if (
      username.toLowerCase() === contracts.DEFAULT_ADMIN_USERNAME.toLowerCase() &&
      data.password === mod.DEFAULT_ADMIN_PASSWORD
    ) {
      throw new Error("Choose credentials that differ from the default ones.");
    }

    const existing = await mod.findAccountByUsername(username);
    if (existing && existing.id !== account.id) throw new Error("That username is already taken.");

    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({
        username,
        password_hash: await mod.hashPassword(data.password),
        must_change_credentials: false,
        is_default_credentials: false,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", account.id);
    if (error) throw new Error(error.message);

    await mod.audit({
      account: { id: account.id, username },
      action: "admin_security_setup_completed",
      entityType: "admin_accounts",
      entityId: account.id,
    });

    const fresh = await mod.findAccountById(account.id);
    return mod.toSessionInfo(fresh!, await mod.sessionTimeoutMinutes());
  });

/** Change your own username and/or password. Current password required. */
export const adminChangeCredentialsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      currentPassword: string;
      username?: string;
      password?: string;
      confirmPassword?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const account = await mod.requireReadyAdmin();
    if (!(await mod.verifyPassword(data.currentPassword, account.password_hash))) {
      throw new Error("Your current password is incorrect.");
    }

    const update: Record<string, unknown> = {};
    if (data.username && data.username.trim() !== account.username) {
      const username = data.username.trim();
      const usernameError = contracts.validateAdminUsername(username);
      if (usernameError) throw new Error(usernameError);
      const existing = await mod.findAccountByUsername(username);
      if (existing && existing.id !== account.id)
        throw new Error("That username is already taken.");
      update.username = username;
    }
    if (data.password) {
      if (data.password !== data.confirmPassword) throw new Error("Passwords do not match.");
      const passwordError = contracts.validateAdminPassword(data.password);
      if (passwordError) throw new Error(passwordError);
      update.password_hash = await mod.hashPassword(data.password);
    }
    if (Object.keys(update).length === 0) throw new Error("Nothing to update.");

    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update(update as never)
      .eq("id", account.id);
    if (error) throw new Error(error.message);

    await mod.audit({
      account,
      action: "admin_credentials_changed",
      entityType: "admin_accounts",
      entityId: account.id,
      details: {
        username_changed: Boolean(update.username),
        password_changed: Boolean(update.password_hash),
      },
    });
    return { ok: true as const };
  });

/**
 * Restores this account to the factory credentials. Guarded by the current
 * password and re-arms the mandatory security setup on the next sign-in.
 */
export const adminResetCredentialsFn = createServerFn({ method: "POST" })
  .inputValidator((data: { currentPassword: string; confirm: string }) => data)
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const account = await mod.requireReadyAdmin();
    if (data.confirm.trim().toUpperCase() !== "RESET") throw new Error("Type RESET to confirm.");
    if (!(await mod.verifyPassword(data.currentPassword, account.password_hash))) {
      throw new Error("Your current password is incorrect.");
    }

    const conflict = await mod.findAccountByUsername(contracts.DEFAULT_ADMIN_USERNAME);
    if (conflict && conflict.id !== account.id) {
      throw new Error("Another administrator already uses the default username.");
    }

    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({
        username: contracts.DEFAULT_ADMIN_USERNAME,
        password_hash: await mod.hashPassword(mod.DEFAULT_ADMIN_PASSWORD),
        must_change_credentials: true,
        is_default_credentials: true,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", account.id);
    if (error) throw new Error(error.message);

    await mod.audit({
      account,
      action: "admin_credentials_reset",
      entityType: "admin_accounts",
      entityId: account.id,
    });

    const session = await mod.adminSession();
    await session.clear();
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Admin user management (Super Admin only)                            */
/* ------------------------------------------------------------------ */

export const adminListUsersFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminAccountSummary[]> => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await mod.requireReadyAdmin("admin_users");
    const { data, error } = await supabaseAdmin
      .from("admin_accounts")
      .select(
        "id,username,role,is_active,must_change_credentials,last_login_at,last_login_ip,locked_until,created_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminAccountSummary[];
  },
);

export const adminCreateUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string; role: AdminRole }) => data)
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const actor = await mod.requireReadyAdmin("admin_users");
    const username = data.username.trim();
    const usernameError = contracts.validateAdminUsername(username);
    if (usernameError) throw new Error(usernameError);
    const passwordError = contracts.validateAdminPassword(data.password);
    if (passwordError) throw new Error(passwordError);
    if (!contracts.ADMIN_ROLES.includes(data.role)) throw new Error("Unknown administrator role.");
    if (await mod.findAccountByUsername(username))
      throw new Error("That username is already taken.");

    const { data: created, error } = await supabaseAdmin
      .from("admin_accounts")
      .insert({
        username,
        password_hash: await mod.hashPassword(data.password),
        role: data.role,
        created_by: actor.id,
        must_change_credentials: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await mod.audit({
      account: actor,
      action: "admin_user_created",
      entityType: "admin_accounts",
      entityId: created?.id ?? null,
      details: { username, role: data.role },
    });
    return { ok: true as const };
  });

export const adminUpdateUserFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { id: string; role?: AdminRole; isActive?: boolean; password?: string }) => data,
  )
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const contracts = await import("./contracts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const actor = await mod.requireReadyAdmin("admin_users");
    const target = await mod.findAccountById(data.id);
    if (!target) throw new Error("Administrator not found.");

    const update: Record<string, unknown> = {};
    if (data.role && data.role !== target.role) {
      if (!contracts.ADMIN_ROLES.includes(data.role))
        throw new Error("Unknown administrator role.");
      if (target.role === "super_admin" && (await countActiveSuperAdmins()) <= 1) {
        throw new Error("The last Super Admin cannot be demoted.");
      }
      update.role = data.role;
    }
    if (typeof data.isActive === "boolean" && data.isActive !== target.is_active) {
      if (
        !data.isActive &&
        target.role === "super_admin" &&
        (await countActiveSuperAdmins()) <= 1
      ) {
        throw new Error("The last Super Admin cannot be disabled.");
      }
      if (!data.isActive && target.id === actor.id)
        throw new Error("You cannot disable your own account.");
      update.is_active = data.isActive;
      if (data.isActive) {
        update.failed_attempts = 0;
        update.locked_until = null;
      }
    }
    if (data.password) {
      const passwordError = contracts.validateAdminPassword(data.password);
      if (passwordError) throw new Error(passwordError);
      update.password_hash = await mod.hashPassword(data.password);
      update.must_change_credentials = true;
      update.failed_attempts = 0;
      update.locked_until = null;
    }
    if (Object.keys(update).length === 0) throw new Error("Nothing to update.");

    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update(update as never)
      .eq("id", target.id);
    if (error) throw new Error(error.message);

    await mod.audit({
      account: actor,
      action: "admin_user_updated",
      entityType: "admin_accounts",
      entityId: target.id,
      details: { username: target.username, ...update, password_hash: undefined },
    });
    return { ok: true as const };

    async function countActiveSuperAdmins() {
      const { count } = await supabaseAdmin
        .from("admin_accounts")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("is_active", true);
      return count ?? 0;
    }
  });

export const adminDeleteUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const actor = await mod.requireReadyAdmin("admin_users");
    const target = await mod.findAccountById(data.id);
    if (!target) throw new Error("Administrator not found.");
    if (target.id === actor.id) throw new Error("You cannot remove your own account.");
    if (target.role === "super_admin") {
      const { count } = await supabaseAdmin
        .from("admin_accounts")
        .select("id", { count: "exact", head: true })
        .eq("role", "super_admin")
        .eq("is_active", true);
      if ((count ?? 0) <= 1) throw new Error("The last Super Admin cannot be removed.");
    }

    const { error } = await supabaseAdmin.from("admin_accounts").delete().eq("id", target.id);
    if (error) throw new Error(error.message);

    await mod.audit({
      account: actor,
      action: "admin_user_removed",
      entityType: "admin_accounts",
      entityId: target.id,
      details: { username: target.username },
    });
    return { ok: true as const };
  });

export const adminAuditLogFn = createServerFn({ method: "POST" })
  .inputValidator((data: { limit?: number; search?: string } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<AdminAuditEntry[]> => {
    const mod = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await mod.requireReadyAdmin("audit");

    let query = supabaseAdmin
      .from("admin_audit_logs")
      .select("id,admin_username,action,entity_type,entity_id,details,ip_address,created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 200, 500));
    if (data.search?.trim()) query = query.ilike("action", `%${data.search.trim()}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AdminAuditEntry[];
  });
