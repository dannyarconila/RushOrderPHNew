import type { AppRole } from "@/types";
import { ROLE_HOME } from "@/types";

export function getDashboardRoute(role: AppRole | null | undefined): string {
  if (!role) return "/login";
  return ROLE_HOME[role] ?? "/login";
}
