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

export function claimNumber() {
  return `RO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export interface PlaceOrderInput {
  customerId: string;
  storeId: string;
  addressId: string | null;
  notes: string;
  paymentMethod: PaymentMethod;
  quote: OrderQuote;
  lines: { productId: string; name: string; price: number; quantity: number }[];
}

/** Creates the order plus its line items and returns the new order id. */
export async function placeOrder(input: PlaceOrderInput): Promise<string> {
  const { quote } = input;
  const { data, error } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customerId,
      store_id: input.storeId,
      address_id: input.addressId,
      status: "pending",
      payment_method: input.paymentMethod,
      payment_status: input.paymentMethod === "cod" ? "pending" : "pending",
      subtotal: quote.subtotal,
      delivery_fee: quote.deliveryFee,
      surge_fee: quote.surgeFee,
      tax: quote.tax,
      total: quote.total,
      seller_commission: quote.sellerCommission,
      rider_commission: quote.riderCommission,
      distance_km: quote.distanceKm,
      claim_number: claimNumber(),
      notes: input.notes.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: itemsError } = await supabase.from("order_items").insert(
    input.lines.map((line) => ({
      order_id: data.id,
      product_id: line.productId,
      product_name: line.name,
      unit_price: line.price,
      quantity: line.quantity,
    })),
  );
  if (itemsError) throw itemsError;

  return data.id;
}

const ORDER_FIELDS =
  "id,customer_id,store_id,status,payment_method,payment_status,subtotal,delivery_fee,surge_fee,tax,total,distance_km,claim_number,notes,created_at,updated_at,order_items(product_name,quantity)";

export interface OrderItemPreview {
  product_name: string;
  quantity: number;
}

export type OrderRow = Pick<
  Database["public"]["Tables"]["orders"]["Row"],
  | "id"
  | "customer_id"
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

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
  if (error) throw error;
}

/** Customer can cancel only while order is still pending. */
export async function cancelOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) throw error;
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
