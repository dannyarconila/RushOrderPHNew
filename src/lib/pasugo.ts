import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { claimNumber } from "@/lib/orders";
import { estimateDeliveryFee } from "@/lib/marketplace";

export type PasugoStatus =
  | "requested"
  | "finding_rider"
  | "accepted"
  | "rider_arriving"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "completed"
  | "cancelled"
  | "failed";

export interface PasugoBooking {
  id: string;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  notes: string | null;
  estimated_distance_km: number;
  estimated_fare: number;
  status: PasugoStatus;
  assigned_rider_id: string | null;
  rider_fee_per_booking: number | null;
  rider_fee_deducted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasugoDispatchJob {
  id: string;
  booking_id: string;
  status: "searching" | "assigned" | "picked_up" | "delivered" | "failed" | "cancelled";
  radius_km: number;
  attempt: number;
  max_attempts: number;
  distance_km: number;
  delivery_fee: number;
  pickup_address: string | null;
  dropoff_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  assigned_rider_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PasugoOfferWithJob {
  offer: {
    id: string;
    job_id: string;
    booking_id: string;
    rider_id: string;
    status: string;
    expires_at: string;
    distance_km: number | null;
  };
  job: PasugoDispatchJob;
  booking: PasugoBooking;
}

export interface CreatePasugoInput {
  userId: string;
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  notes?: string;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));
  return Math.round(6371 * c * 100) / 100;
}

async function loadDispatchSettings() {
  const { data, error } = await supabase.rpc("dispatch_settings");
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

async function loadRiderDeliveryFee() {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "rider_delivery_fee")
    .maybeSingle();
  if (error) throw error;
  const raw = data?.value;
  const num = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function splitLineAddress(line: string) {
  const [line1, barangay, city, province] = line
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    line1: line1 ?? line,
    barangay: barangay ?? null,
    city: city ?? null,
    province: province ?? null,
  };
}

export async function createPasugoBooking(input: CreatePasugoInput): Promise<string> {
  const pickupLat = input.pickupLat ?? null;
  const pickupLng = input.pickupLng ?? null;
  const dropoffLat = input.dropoffLat ?? null;
  const dropoffLng = input.dropoffLng ?? null;

  const distanceKm =
    pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null
      ? haversineKm(pickupLat, pickupLng, dropoffLat, dropoffLng)
      : 0;

  const settings = await loadDispatchSettings();
  const riderDeliveryFee = await loadRiderDeliveryFee();
  const deliveryFee = estimateDeliveryFee(distanceKm, settings);

  const slug = `pasugo-pickup-${input.userId.slice(0, 8)}`;
  const pickupParts = splitLineAddress(input.pickupAddress.trim());
  const dropoffParts = splitLineAddress(input.dropoffAddress.trim());

  const { data: existingStore, error: existingStoreError } = await supabase
    .from("stores")
    .select("id")
    .eq("owner_id", input.userId)
    .eq("slug", slug)
    .maybeSingle();
  if (existingStoreError) throw existingStoreError;

  let storeId = existingStore?.id ?? null;
  if (!storeId) {
    const { data: createdStore, error: createStoreError } = await supabase
      .from("stores")
      .insert({
        owner_id: input.userId,
        name: "Pasugo Pickup",
        slug,
        description: "Virtual pickup point for standalone Pasugo bookings.",
        service_type: "services",
        is_active: true,
        is_online: false,
        is_approved: false,
        address: {
          line1: pickupParts.line1,
          barangay: pickupParts.barangay,
          city: pickupParts.city,
          province: pickupParts.province,
        },
        latitude: pickupLat,
        longitude: pickupLng,
      })
      .select("id")
      .single();
    if (createStoreError) throw createStoreError;
    storeId = createdStore.id;
  } else {
    const { error: updateStoreError } = await supabase
      .from("stores")
      .update({
        address: {
          line1: pickupParts.line1,
          barangay: pickupParts.barangay,
          city: pickupParts.city,
          province: pickupParts.province,
        },
        latitude: pickupLat,
        longitude: pickupLng,
      })
      .eq("id", storeId)
      .eq("owner_id", input.userId);
    if (updateStoreError) throw updateStoreError;
  }

  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .insert({
      user_id: input.userId,
      label: "Pasugo drop-off",
      recipient_name: input.customerName.trim() || null,
      phone: input.customerPhone.trim() || null,
      line1: dropoffParts.line1,
      barangay: dropoffParts.barangay,
      city: dropoffParts.city,
      province: dropoffParts.province,
      latitude: dropoffLat,
      longitude: dropoffLng,
      is_default: false,
    })
    .select("id")
    .single();
  if (addressError) throw addressError;

  const notes = [
    `[PASUGO] ${input.notes?.trim() || "Standalone rider booking"}`,
    `Pickup: ${input.pickupAddress.trim()}`,
    `Drop-off: ${input.dropoffAddress.trim()}`,
  ].join("\n");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: input.userId,
      store_id: storeId,
      address_id: address.id,
      status: "ready",
      payment_method: "cod",
      payment_status: "pending",
      subtotal: 0,
      delivery_fee: deliveryFee,
      surge_fee: 0,
      tax: 0,
      total: deliveryFee,
      seller_commission: 0,
      rider_commission: riderDeliveryFee,
      distance_km: distanceKm,
      claim_number: claimNumber(),
      notes,
    })
    .select("id")
    .single();
  if (orderError) throw orderError;

  const orderId = order.id as string;
  const { error: startErr } = await supabase.rpc("dispatch_start", { _order_id: orderId });
  if (startErr) throw startErr;

  return orderId;
}

export type PasugoOrderRow = {
  id: string;
  status: "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "delivered" | "cancelled";
  created_at: string;
  claim_number: string | null;
  total: number;
};

export function customerLatestPasugoOrderQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["pasugo-order-latest", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PasugoOrderRow | null> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,created_at,claim_number,total")
        .eq("customer_id", userId!)
        .ilike("notes", "[PASUGO]%")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasugoOrderRow | null;
    },
  });
}

export function customerPasugoOrdersQuery(userId: string | undefined, limit = 5) {
  return queryOptions({
    queryKey: ["pasugo-order-list", userId ?? null, limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PasugoOrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,created_at,claim_number,total")
        .eq("customer_id", userId!)
        .ilike("notes", "[PASUGO]%")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PasugoOrderRow[];
    },
  });
}

export function pasugoBookingQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["pasugo-booking", bookingId],
    queryFn: async (): Promise<PasugoBooking | null> => {
      const { data, error } = await supabase
        .from("pasugo_bookings")
        .select("*")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasugoBooking | null;
    },
  });
}

export function pasugoJobQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["pasugo-job", bookingId],
    queryFn: async (): Promise<PasugoDispatchJob | null> => {
      const { data, error } = await supabase
        .from("pasugo_dispatch_jobs")
        .select("*")
        .eq("booking_id", bookingId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasugoDispatchJob | null;
    },
  });
}

export function riderPendingPasugoOfferQuery(riderId: string | undefined) {
  return queryOptions({
    queryKey: ["pasugo-offer", riderId ?? null],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<PasugoOfferWithJob | null> => {
      const { data, error } = await supabase
        .from("pasugo_dispatch_offers")
        .select("*,pasugo_dispatch_jobs(*),pasugo_bookings(*)")
        .eq("rider_id", riderId!)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const row = data as {
        id: string;
        job_id: string;
        booking_id: string;
        rider_id: string;
        status: string;
        expires_at: string;
        distance_km: number | null;
        pasugo_dispatch_jobs: PasugoDispatchJob | null;
        pasugo_bookings: PasugoBooking | null;
      };
      if (!row.pasugo_dispatch_jobs || !row.pasugo_bookings) return null;
      if (row.pasugo_dispatch_jobs.status !== "searching") return null;

      return {
        offer: {
          id: row.id,
          job_id: row.job_id,
          booking_id: row.booking_id,
          rider_id: row.rider_id,
          status: row.status,
          expires_at: row.expires_at,
          distance_km: row.distance_km,
        },
        job: row.pasugo_dispatch_jobs,
        booking: row.pasugo_bookings,
      };
    },
  });
}

export function activePasugoJobForRiderQuery(riderId: string | undefined) {
  return queryOptions({
    queryKey: ["pasugo-active-job", riderId ?? null],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<PasugoDispatchJob | null> => {
      const { data, error } = await supabase
        .from("pasugo_dispatch_jobs")
        .select("*")
        .eq("assigned_rider_id", riderId!)
        .in("status", ["assigned", "picked_up"])
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasugoDispatchJob | null;
    },
  });
}

export async function acceptPasugoDispatch(
  jobId: string,
): Promise<{ ok: boolean; booking_id?: string | null; reason?: string | null }> {
  const { data, error } = await supabase.rpc("pasugo_dispatch_accept", {
    _job_id: jobId,
  });

  if (error) throw error;

  return (
    (data as {
      ok: boolean;
      booking_id?: string | null;
      reason?: string | null;
    } | null) ?? { ok: false }
  );
}

export async function declinePasugoDispatch(jobId: string) {
  const { error } = await supabase.rpc("pasugo_dispatch_decline", { _job_id: jobId });
  if (error) throw error;
}

export async function advancePasugoDispatch(
  jobId: string,
  step: "arrived" | "picked_up" | "delivered" | "completed",
) {
  const { error } = await supabase.rpc("pasugo_dispatch_advance", { _job_id: jobId, _step: step });
  if (error) throw error;
}

export async function retryPasugoDispatch(jobId: string) {
  const { error } = await supabase.rpc("pasugo_dispatch_retry", { _job_id: jobId });
  if (error) throw error;
}

export async function cancelPasugoBooking(bookingId: string) {
  const { error } = await supabase.rpc("pasugo_cancel", { _booking_id: bookingId });
  if (error) throw error;
}

export function customerLatestPasugoQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["pasugo-customer-latest", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PasugoBooking | null> => {
      const { data, error } = await supabase
        .from("pasugo_bookings")
        .select("*")
        .eq("customer_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasugoBooking | null;
    },
  });
}

export function customerPasugoBookingsQuery(userId: string | undefined, limit = 5) {
  return queryOptions({
    queryKey: ["pasugo-customer-list", userId ?? null, limit],
    enabled: Boolean(userId),
    queryFn: async (): Promise<PasugoBooking[]> => {
      const { data, error } = await supabase
        .from("pasugo_bookings")
        .select("*")
        .eq("customer_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PasugoBooking[];
    },
  });
}
