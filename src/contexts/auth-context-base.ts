import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

import type { AppRole } from "@/types";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  hasRole: (role: AppRole) => boolean;
  primaryRole: AppRole;
  refreshRoles: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
