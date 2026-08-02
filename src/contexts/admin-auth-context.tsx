/**
 * Internal Admin Portal session context.
 *
 * Completely isolated from the public Supabase Auth flow used by customers,
 * sellers and riders: the portal session lives in an encrypted, HTTP-only
 * cookie managed server-side. This context only mirrors the non-sensitive
 * session summary and drives idle-timeout sign-out in the browser.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { adminLoginFn, adminLogoutFn, adminSessionInfoFn } from "@/lib/admin/auth.functions";
import type { AdminPermission, AdminSessionInfo } from "@/lib/admin/contracts";
import { roleCan } from "@/lib/admin/contracts";

interface AdminAuthValue {
  session: AdminSessionInfo | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (reason?: string) => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: AdminPermission) => boolean;
  signOutReason: string | null;
  clearSignOutReason: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue | undefined>(undefined);

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [signOutReason, setSignOutReason] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["admin-portal", "session"],
    queryFn: () => adminSessionInfoFn(),
    staleTime: 60_000,
    retry: false,
  });

  const session = sessionQuery.data ?? null;

  const login = useMutation({
    mutationFn: (input: { username: string; password: string }) => adminLoginFn({ data: input }),
    onSuccess: (info) => {
      setSignOutReason(null);
      queryClient.setQueryData(["admin-portal", "session"], info);
    },
  });

  const signOut = useCallback(
    async (reason?: string) => {
      try {
        await adminLogoutFn();
      } finally {
        queryClient.setQueryData(["admin-portal", "session"], null);
        queryClient.removeQueries({ queryKey: ["admin"] });
        setSignOutReason(reason ?? null);
      }
    },
    [queryClient],
  );

  // Idle timeout — mirrors the server-side session expiry so an unattended
  // console does not stay open.
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    if (!session) return;
    const timeoutMs = Math.max(session.sessionTimeoutMinutes, 1) * 60_000;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, bump, { passive: true }));
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= timeoutMs) {
        void signOut("Signed out after inactivity.");
      }
    }, 30_000);
    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, bump));
      window.clearInterval(interval);
    };
  }, [session, signOut]);

  const value = useMemo<AdminAuthValue>(
    () => ({
      session,
      loading: sessionQuery.isLoading,
      signIn: async (username, password) => {
        await login.mutateAsync({ username, password });
      },
      signOut,
      refresh: async () => {
        await sessionQuery.refetch();
      },
      can: (permission) => (session ? roleCan(session.role, permission) : false),
      signOutReason,
      clearSignOutReason: () => setSignOutReason(null),
    }),
    [session, sessionQuery, login, signOut, signOutReason],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return context;
}
