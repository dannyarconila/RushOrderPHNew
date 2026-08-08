import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { estimateDeliveryFee } from "@/lib/marketplace";

export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const ORDER_FLOW: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
  "delivered",
];

export const ORDER_LABELS: Record<OrderStatus, string> = {
  pending: "Waiting for the store",
  confirmed: "Order accepted",
  preparing: "Preparing your order",
  ready: "Ready for pickup",
  picked_up: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const num = (settings: Record<string, unknown>, key: string, fallback: number) => {
  const raw = settings[key];
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface QuoteInput {
  subtotal: number;
  distanceKm: number;
  settings: Record<string, unknown>;
  deliveryFeeOverride?: number | null;
}

export interface OrderQuote {
  subtotal: number;
  deliveryFee: number;
  surgeFee: number;
  tax: number;
  total: number;
  sellerCommission: number;
  riderCommission: number;
  distanceKm: number;
}

/** Single source of truth for order money maths — used by checkout and order records. */
export function quoteOrder({
  subtotal,
  distanceKm,
  settings,
  deliveryFeeOverride,
}: QuoteInput): OrderQuote {
  const round = (v: number) => Math.round(v * 100) / 100;
  const deliveryFee = round(
    deliveryFeeOverride != null && deliveryFeeOverride >= 0
      ? deliveryFeeOverride
      : estimateDeliveryFee(distanceKm, settings),
  );
  const surgeRate = num(settings, "surge_multiplier", 1);
  const surgeFee = round(deliveryFee * Math.max(0, surgeRate - 1));
  const tax = round(subtotal * num(settings, "tax_rate", 0));
  const sellerCommission = round(subtotal * num(settings, "seller_commission_rate", 0.1));
  const riderCommission = round(num(settings, "rider_delivery_fee", 5));
  return {
    subtotal: round(subtotal),
    deliveryFee,
    surgeFee,
    tax,
    total: round(subtotal + deliveryFee + surgeFee + tax),
    sellerCommission,
    riderCommission,
    distanceKm: round(distanceKm),
  };
}

export interface PlaceOrderInput {
  storeId: string;
  addressId: string;
  notes: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  lines: { productId: string; quantity: number }[];
}

/** Creates the order server-side and returns the authoritative order id. */
export async function placeOrder(input: PlaceOrderInput): Promise<string> {
  const { data, error } = await supabase.rpc("create_order_secure", {
    _store_id: input.storeId,
    _address_id: input.addressId,
    _payment_method: input.paymentMethod,
    _notes: input.notes.trim() || undefined,
    _idempotency_key: input.idempotencyKey,
    _items: input.lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
    })),
  });
  if (error) throw error;
  return data;
}

const ORDER_FIELDS =
  "id,customer_id,rider_id,store_id,status,payment_method,payment_status,subtotal,delivery_fee,surge_fee,tax,total,distance_km,claim_number,notes,created_at,updated_at,stores(name),order_items(product_name,quantity)";

export interface OrderItemPreview {
  product_name: string;
  quantity: number;
}

const ORDER_SUBMISSION_KEY_PREFIX = "rushorder.order-idempotency.v1:";

export function orderIntentSignature(input: {
  userId: string;
  storeId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  notes: string;
  lines: { productId: string; quantity: number }[];
}) {
  const normalized = {
    userId: input.userId,
    storeId: input.storeId,
    addressId: input.addressId,
    paymentMethod: input.paymentMethod,
    notes: input.notes.trim(),
    lines: [...input.lines]
      .sort((left, right) => left.productId.localeCompare(right.productId))
      .map((line) => ({ productId: line.productId, quantity: line.quantity })),
  };
  return JSON.stringify(normalized);
}

export function getOrderIdempotencyKey(signature: string) {
  if (typeof window === "undefined") return "";
  const storageKey = `${ORDER_SUBMISSION_KEY_PREFIX}${signature}`;
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function clearOrderIdempotencyKey(signature: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(`${ORDER_SUBMISSION_KEY_PREFIX}${signature}`);
}

export type OrderRow = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  | "id"
  | "customer_id"
  | "rider_id"
  | "store_id"
  | "status"
  | "payment_method"
  | "payment_status"
  | "subtotal"
  | "delivery_fee"
  | "surge_fee"
  | "tax"
  | "total"
  | "distance_km"
  | "claim_number"
  | "notes"
  | "created_at"
  | "updated_at"
> & {
  stores?: { name: string } | null;
  order_items?: OrderItemPreview[] | null;
};

export function myOrdersQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["my-orders", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_FIELDS)
        .eq("customer_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });
}

export function orderQuery(orderId: string) {
  return queryOptions({
    queryKey: ["order", orderId],
    queryFn: async (): Promise<OrderRow | null> => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_FIELDS)
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrderRow | null;
    },
  });
}

export function orderItemsQuery(orderId: string) {
  return queryOptions({
    queryKey: ["order-items", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id,product_name,unit_price,quantity")
        .eq("order_id", orderId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Orders belonging to the seller's stores, newest first. */
export function storeOrdersQuery(storeIds: string[]) {
  return queryOptions({
    queryKey: ["store-orders", [...storeIds].sort().join(",")],
    enabled: storeIds.length > 0,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_FIELDS)
        .in("store_id", storeIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });
}

export async function transitionOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase.rpc("transition_order_status", {
    _order_id: orderId,
    _next_status: status,
  });
  if (error) throw error;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  await transitionOrderStatus(orderId, status);
}

/** Customer can cancel only while order is still pending. */
export async function cancelOrder(orderId: string) {
  await transitionOrderStatus(orderId, "cancelled");
}
/** Hide an order from the customer's history (soft delete). */
export async function deleteOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) throw error;
}

export function claimNumber() {
  return `RO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
