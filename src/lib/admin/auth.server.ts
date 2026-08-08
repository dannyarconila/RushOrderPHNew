/**
 * Internal Admin Portal — server-only authentication core.
 *
 * Completely isolated from the public Supabase auth used by customers,
 * sellers and riders: admin identities live in `public.admin_accounts`
 * (service-role only) and the session is an encrypted, http-only cookie.
 *
 * Nothing in here depends on the surrounding app, so the portal can be lifted
 * to admin.rushorderph.com without changing backend logic.
 */
import { useSession, getRequestIP, getRequestHeader } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  DEFAULT_ADMIN_USERNAME,
  permissionsFor,
  type AdminPermission,
  type AdminRole,
  type AdminSessionInfo,
} from "./contracts";

/** Factory resets are opt-in; production credentials never live in source control. */
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_FACTORY_RESET_PASSWORD ?? "";
const BOOTSTRAP_ADMIN_USERNAME = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() ?? "";
const BOOTSTRAP_ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";

const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const DEFAULT_TIMEOUT_MINUTES = 30;
const SESSION_NAME = "rushorder-admin";

export interface AdminAccount {
  id: string;
  username: string;
  password_hash: string;
  role: AdminRole;
  is_active: boolean;
  is_default_credentials: boolean;
  must_change_credentials: boolean;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
}

interface AdminSessionData {
  adminId?: string;
  lastSeen?: number;
}

let bootstrapAdminPromise: Promise<void> | null = null;

/* ------------------------------------------------------------------ */
/* Password hashing (WebCrypto PBKDF2 — Worker safe)                   */
/* ------------------------------------------------------------------ */

const toHex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((byte) => parseInt(byte, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;
  const candidate = await derive(password, fromHex(salt), Number(iterations));
  return constantTimeEquals(candidate, hash);
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

function sessionConfig() {
  const password = process.env.ADMIN_SESSION_SECRET;
  if (!password) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  return {
    password,
    name: SESSION_NAME,
    maxAge: 60 * 60 * 12,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export const useAdminSession = () => useSession<AdminSessionData>(sessionConfig());

export function clientIp(): string | null {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? getRequestHeader("cf-connecting-ip") ?? null;
  } catch {
    return null;
  }
}

export async function sessionTimeoutMinutes(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "admin_session_timeout_minutes")
    .maybeSingle();
  const raw = Number(data?.value ?? DEFAULT_TIMEOUT_MINUTES);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_TIMEOUT_MINUTES;
}

async function ensureBootstrapAdmin(): Promise<void> {
  if (bootstrapAdminPromise) {
    await bootstrapAdminPromise;
    return;
  }

  bootstrapAdminPromise = (async () => {
    const { count, error } = await supabaseAdmin
      .from("admin_accounts")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    if (error) throw new Error(`Could not inspect administrator bootstrap state: ${error.message}`);

    if ((count ?? 0) > 0) return;
    if (!BOOTSTRAP_ADMIN_USERNAME || !BOOTSTRAP_ADMIN_PASSWORD) return;

    const password_hash = await hashPassword(BOOTSTRAP_ADMIN_PASSWORD);
    const payload = {
      username: BOOTSTRAP_ADMIN_USERNAME,
      password_hash,
      role: "super_admin" as const,
      is_active: true,
      is_default_credentials: false,
      must_change_credentials: true,
      failed_attempts: 0,
      locked_until: null,
    };

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("admin_accounts")
      .select("id")
      .eq("username", BOOTSTRAP_ADMIN_USERNAME)
      .maybeSingle();
    if (existingError) {
      throw new Error(
        `Could not inspect bootstrap administrator account: ${existingError.message}`,
      );
    }

    const { error: writeError } = existing
      ? await supabaseAdmin.from("admin_accounts").update(payload).eq("id", existing.id)
      : await supabaseAdmin.from("admin_accounts").insert(payload);
    if (writeError) {
      throw new Error(`Could not provision bootstrap administrator account: ${writeError.message}`);
    }

    const { error: auditError } = await supabaseAdmin.from("admin_audit_logs").insert({
      admin_username: BOOTSTRAP_ADMIN_USERNAME,
      action: existing ? "bootstrap_admin_refreshed" : "bootstrap_admin_provisioned",
      entity_type: "admin_accounts",
      details: { must_change_credentials: true } as never,
    });
    if (auditError) {
      throw new Error(`Could not write bootstrap administrator audit log: ${auditError.message}`);
    }
  })().finally(() => {
    bootstrapAdminPromise = null;
  });

  await bootstrapAdminPromise;
}

/* ------------------------------------------------------------------ */
/* Account lookups                                                     */
/* ------------------------------------------------------------------ */

export async function findAccountByUsername(username: string): Promise<AdminAccount | null> {
  await ensureBootstrapAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_accounts")
    .select("*")
    .ilike("username", username.trim())
    .maybeSingle();
  if (error) throw new Error(`Could not read administrator account: ${error.message}`);
  return (data as AdminAccount | null) ?? null;
}

export async function findAccountById(id: string): Promise<AdminAccount | null> {
  await ensureBootstrapAdmin();
  const { data, error } = await supabaseAdmin
    .from("admin_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read administrator account: ${error.message}`);
  return (data as AdminAccount | null) ?? null;
}

export class AdminAuthError extends Error {}

/**
 * Server-side gate for every admin request. Validates the encrypted session
 * cookie against the live account row and enforces the inactivity timeout.
 * Never trust a client-side role check — call this in every admin handler.
 */
export async function requireAdmin(permission?: AdminPermission): Promise<AdminAccount> {
  // TanStack Start exposes request sessions through a hook-like server API.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useAdminSession();
  const adminId = session.data.adminId;
  if (!adminId)
    throw new AdminAuthError("Your administrator session has ended. Please sign in again.");

  const timeout = await sessionTimeoutMinutes();
  const lastSeen = session.data.lastSeen ?? 0;
  if (Date.now() - lastSeen > timeout * 60_000) {
    await session.clear();
    throw new AdminAuthError("Session timed out due to inactivity. Please sign in again.");
  }

  const account = await findAccountById(adminId);
  if (!account || !account.is_active) {
    await session.clear();
    throw new AdminAuthError("This administrator account is no longer active.");
  }

  await session.update({ adminId, lastSeen: Date.now() });

  if (
    permission &&
    account.role !== "super_admin" &&
    !permissionsFor(account.role).includes(permission)
  ) {
    throw new AdminAuthError("Your administrator role does not allow this action.");
  }

  return account;
}

/** Same as requireAdmin but also blocks access while a security setup is pending. */
export async function requireReadyAdmin(permission?: AdminPermission): Promise<AdminAccount> {
  const account = await requireAdmin(permission);
  if (account.must_change_credentials) {
    throw new AdminAuthError("Complete the administrator security setup before continuing.");
  }
  return account;
}

export function toSessionInfo(account: AdminAccount, timeoutMinutes: number): AdminSessionInfo {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    permissions: permissionsFor(account.role),
    mustChangeCredentials: account.must_change_credentials,
    lastLoginAt: account.last_login_at,
    lastLoginIp: account.last_login_ip,
    sessionTimeoutMinutes: timeoutMinutes,
  };
}

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

export async function audit(input: {
  account?: Pick<AdminAccount, "id" | "username"> | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("admin_audit_logs").insert({
    admin_id: input.account?.id ?? null,
    admin_username: input.account?.username ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    details: (input.details ?? {}) as never,
    ip_address: clientIp(),
  });
  if (error) throw new Error(`Could not write administrator audit log: ${error.message}`);
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

export async function attemptLogin(username: string, password: string): Promise<AdminAccount> {
  const generic = "Invalid username or password.";
  const account = await findAccountByUsername(username);

  if (!account || !account.is_active) {
    await audit({
      action: "admin_login_failed",
      details: { username, reason: "unknown_or_inactive" },
    });
    throw new AdminAuthError(generic);
  }

  if (account.locked_until && new Date(account.locked_until) > new Date()) {
    throw new AdminAuthError("Too many failed attempts. This account is temporarily locked.");
  }

  const ok = await verifyPassword(password, account.password_hash);
  if (!ok) {
    const attempts = account.failed_attempts + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    const { error } = await supabaseAdmin
      .from("admin_accounts")
      .update({
        failed_attempts: locked ? 0 : attempts,
        locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      })
      .eq("id", account.id);
    if (error) throw new Error(`Could not update administrator account: ${error.message}`);
    await audit({
      account,
      action: "admin_login_failed",
      details: { attempts, locked },
    });
    throw new AdminAuthError(
      locked ? `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` : generic,
    );
  }

  const ip = clientIp();
  const { error } = await supabaseAdmin
    .from("admin_accounts")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      last_login_ip: ip,
    })
    .eq("id", account.id);
  if (error) throw new Error(`Could not update administrator login: ${error.message}`);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const session = await useAdminSession();
  await session.update({ adminId: account.id, lastSeen: Date.now() });

  await audit({ account, action: "admin_login", details: { role: account.role } });

  return { ...account, last_login_at: new Date().toISOString(), last_login_ip: ip };
}

export const DEFAULT_CREDENTIALS = {
  username: DEFAULT_ADMIN_USERNAME,
  password: DEFAULT_ADMIN_PASSWORD || undefined,
};
