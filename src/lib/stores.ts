import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ServiceType } from "@/lib/marketplace";

export type StoreVerificationStatus = Database["public"]["Enums"]["store_verification_status"];

export const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "groceries", label: "Groceries" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "services", label: "Services" },
];

export const WEEKDAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export type BusinessHours = Record<WeekdayKey, DayHours>;

export const DEFAULT_HOURS: BusinessHours = WEEKDAYS.reduce((acc, day) => {
  acc[day.key] = { open: "08:00", close: "20:00", closed: false };
  return acc;
}, {} as BusinessHours);

export function parseBusinessHours(value: unknown): BusinessHours {
  if (!value || typeof value !== "object") return DEFAULT_HOURS;
  const raw = value as Record<string, unknown>;
  return WEEKDAYS.reduce((acc, day) => {
    const entry = raw[day.key];
    if (entry && typeof entry === "object") {
      const e = entry as Partial<DayHours>;
      acc[day.key] = {
        open: typeof e.open === "string" ? e.open : DEFAULT_HOURS[day.key].open,
        close: typeof e.close === "string" ? e.close : DEFAULT_HOURS[day.key].close,
        closed: Boolean(e.closed),
      };
    } else {
      acc[day.key] = DEFAULT_HOURS[day.key];
    }
    return acc;
  }, {} as BusinessHours);
}

/** True when the store's schedule says it should currently be serving. */
export function isWithinBusinessHours(hours: BusinessHours, now = new Date()): boolean {
  const key = WEEKDAYS[(now.getDay() + 6) % 7].key;
  const today = hours[key];
  if (!today || today.closed) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const open = toMinutes(today.open);
  const close = toMinutes(today.close);
  return close > open ? minutes >= open && minutes < close : minutes >= open || minutes < close;
}

export const MANAGED_STORE_FIELDS =
  "id,owner_id,name,slug,description,phone,logo_url,banner_url,cover_url,service_type,address,latitude,longitude,business_hours,delivery_radius_km,minimum_order,delivery_fee_override,prep_time_minutes,is_online,is_active,is_visible,is_approved,is_featured,wallet_hold,rating,rating_count,verification_status,verification_notes,verified_at,created_at" as const;

export type ManagedStore = Pick<
  Database["public"]["Tables"]["stores"]["Row"],
  | "id"
  | "owner_id"
  | "name"
  | "slug"
  | "description"
  | "phone"
  | "logo_url"
  | "banner_url"
  | "cover_url"
  | "service_type"
  | "address"
  | "latitude"
  | "longitude"
  | "business_hours"
  | "delivery_radius_km"
  | "minimum_order"
  | "delivery_fee_override"
  | "prep_time_minutes"
  | "is_online"
  | "is_active"
  | "is_visible"
  | "is_approved"
  | "is_featured"
  | "wallet_hold"
  | "rating"
  | "rating_count"
  | "verification_status"
  | "verification_notes"
  | "verified_at"
  | "created_at"
>;

/** Every store owned by the signed-in seller (multi-store ready). */
export function myStoresQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["my-stores", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<ManagedStore[]> => {
      const { data, error } = await supabase
        .from("stores")
        .select(MANAGED_STORE_FIELDS)
        .eq("owner_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ManagedStore[];
    },
  });
}

export const VERIFICATION_LABELS: Record<StoreVerificationStatus, string> = {
  pending: "Pending review",
  verified: "Verified",
  suspended: "Suspended",
  rejected: "Rejected",
};

export const VERIFICATION_TONES: Record<StoreVerificationStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  verified: "bg-success/15 text-success border-success/30",
  suspended: "bg-muted text-muted-foreground border-border",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};
