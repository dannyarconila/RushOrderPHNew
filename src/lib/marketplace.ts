import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type ServiceType = "food" | "groceries" | "pharmacy" | "services";

export interface StoreCard {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  service_type: string;
  category_id: string | null;
  is_online: boolean;
  is_featured: boolean;
  business_hours: unknown;
  prep_time_minutes: number;
  minimum_order: number;
  rating: number;
  rating_count: number;
  address: unknown;
  latitude: number | null;
  longitude: number | null;
}

export interface ProductCard {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  stock: number;
  images: unknown;
  is_available: boolean;
}

const STORE_FIELDS =
  "id,name,slug,description,logo_url,banner_url,service_type,category_id,is_online,is_featured,business_hours,prep_time_minutes,minimum_order,rating,rating_count,address,latitude,longitude";
const PRODUCT_FIELDS =
  "id,store_id,name,description,price,compare_at_price,stock,images,is_available";

export function storesQuery(serviceType?: ServiceType) {
  return queryOptions({
    queryKey: ["stores", serviceType ?? "all"],
    queryFn: async (): Promise<StoreCard[]> => {
      let q = supabase
        .from("stores")
        .select(STORE_FIELDS)
        .eq("is_active", true)
        .eq("is_approved", true)
        .eq("verification_status", "verified")
        .is("deleted_at", null)
        .order("is_featured", { ascending: false })
        .order("rating", { ascending: false })
        .limit(60);
      if (serviceType) q = q.eq("service_type", serviceType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StoreCard[];
    },
  });
}

export function storeQuery(storeId: string) {
  return queryOptions({
    queryKey: ["store", storeId],
    queryFn: async (): Promise<StoreCard | null> => {
      const { data, error } = await supabase
        .from("stores")
        .select(STORE_FIELDS)
        .eq("id", storeId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StoreCard | null;
    },
  });
}

export function storeProductsQuery(storeId: string) {
  return queryOptions({
    queryKey: ["store-products", storeId],
    queryFn: async (): Promise<ProductCard[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("store_id", storeId)
        .eq("is_published", true)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("name")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ProductCard[];
    },
  });
}

export function categoriesQuery(serviceType?: ServiceType) {
  return queryOptions({
    queryKey: ["categories", serviceType ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("id,name,slug,service_type,image_url")
        .eq("is_active", true)
        .order("sort_order");
      if (serviceType) q = q.eq("service_type", serviceType);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function publicSettingsQuery() {
  return queryOptions({
    queryKey: ["public-settings"],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key,value")
        .eq("is_public", true);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && typeof images[0] === "string") return images[0];
  return null;
}

/** Base fee + per-km rate, both read from public system settings when available. */
export function estimateDeliveryFee(distanceKm: number, settings: Record<string, unknown>) {
  const num = (key: string, fallback: number) => {
    const raw = settings[key];
    const parsed = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Canonical source: dispatch pricing keys managed in Internal Admin > Dispatch.
  const hasDispatchPricing =
    Object.prototype.hasOwnProperty.call(settings, "dispatch_fee_per_km") ||
    Object.prototype.hasOwnProperty.call(settings, "dispatch_min_fee") ||
    Object.prototype.hasOwnProperty.call(settings, "dispatch_max_fee");

  if (hasDispatchPricing) {
    const perKm = num("dispatch_fee_per_km", 0);
    const minFee = num("dispatch_min_fee", 0);
    const maxFee = num("dispatch_max_fee", Number.MAX_SAFE_INTEGER);
    const raw = Math.round(Math.max(0, distanceKm) * Math.max(0, perKm) * 100) / 100;
    const clamped = Math.max(minFee, Math.min(maxFee, raw));
    return Math.round(clamped * 100) / 100;
  }

  // Backward-compatible fallback for legacy delivery_* keys.
  const base = num("delivery_base_fee", 0);
  const perKm = num("delivery_per_km_fee", 0);
  const freeKm = num("delivery_base_km", 0);
  const extra = Math.max(0, distanceKm - freeKm);
  return Math.round((base + extra * perKm) * 100) / 100;
}

/** Public product search across visible stores; empty term returns nothing. */
export function productSearchQuery(term: string, serviceType?: ServiceType) {
  const needle = term.trim();
  return queryOptions({
    queryKey: ["product-search", needle.toLowerCase(), serviceType ?? "all"],
    enabled: needle.length >= 2,
    queryFn: async (): Promise<
      (ProductCard & { store: { id: string; name: string; service_type: string } | null })[]
    > => {
      const { data, error } = await supabase
        .from("products")
        .select(`${PRODUCT_FIELDS},stores!inner(id,name,service_type)`)
        .ilike("name", `%${needle}%`)
        .eq("is_published", true)
        .eq("is_available", true)
        .is("deleted_at", null)
        .limit(30);
      if (error) throw error;
      const rows = (data ?? []) as unknown as (ProductCard & {
        stores: { id: string; name: string; service_type: string } | null;
      })[];
      return rows
        .filter((r) => !serviceType || r.stores?.service_type === serviceType)
        .map(({ stores, ...rest }) => ({ ...rest, store: stores }));
    },
  });
}
