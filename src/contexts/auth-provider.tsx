import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { AuthContext, type AuthContextValue } from "./auth-context-base";
import { supabase } from "@/integrations/supabase/client";
import {
  registerPushServiceWorker,
  requestPushPermission,
  savePushSubscription,
} from "@/lib/push-notifications";
import type { AppRole } from "@/types";

const ROLE_PRIORITY: AppRole[] = ["customer", "seller", "rider", "admin"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const enablePushNotifications = useCallback(async (userId: string) => {
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

    if (!vapidPublicKey) {
      throw new Error("Push notifications are not configured.");
    }

    await registerPushServiceWorker();

    const permission = await requestPushPermission();

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted.");
    }

    await savePushSubscription(userId, vapidPublicKey);
  }, []);

  const loadRoles = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setRoles([]);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }, []);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setTimeout(() => {
        void loadRoles(nextSession?.user?.id);
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadRoles(data.session?.user?.id);
      setLoading(false);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadRoles]);

  const value = useMemo<AuthContextValue>(() => {
    const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "customer";
    return {
      user: session?.user ?? null,
      session,
      roles,
      loading,
      isAdmin: roles.includes("admin"),
      hasRole: (role: AppRole) => roles.includes(role),
      primaryRole,
      refreshRoles: () => loadRoles(session?.user?.id),
      enablePushNotifications,
    };
  }, [session, roles, loading, loadRoles, enablePushNotifications]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
