import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

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

export async function createPasugoBooking(input: CreatePasugoInput): Promise<string> {
  const { data, error } = await supabase
    .from("pasugo_bookings" as never)
    .insert({
      customer_id: input.userId,
      customer_name: input.customerName.trim() || null,
      customer_phone: input.customerPhone.trim() || null,
      pickup_address: input.pickupAddress.trim(),
      dropoff_address: input.dropoffAddress.trim(),
      pickup_lat: input.pickupLat ?? null,
      pickup_lng: input.pickupLng ?? null,
      dropoff_lat: input.dropoffLat ?? null,
      dropoff_lng: input.dropoffLng ?? null,
      notes: input.notes?.trim() || null,
      status: "requested",
    } as never)
    .select("id")
    .single();

  if (error) throw error;

  const bookingId = (data as { id: string }).id;
  const { error: startErr } = await supabase.rpc("pasugo_start", { _booking_id: bookingId });
  if (startErr) throw startErr;

  return bookingId;
}

export function pasugoBookingQuery(bookingId: string) {
  return queryOptions({
    queryKey: ["pasugo-booking", bookingId],
    queryFn: async (): Promise<PasugoBooking | null> => {
      const { data, error } = await supabase
        .from("pasugo_bookings" as never)
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
        .from("pasugo_dispatch_jobs" as never)
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
        .from("pasugo_dispatch_offers" as never)
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
        .from("pasugo_dispatch_jobs" as never)
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

export async function acceptPasugoDispatch(jobId: string): Promise<{ ok: boolean; booking_id?: string; reason?: string }> {
  const { data, error } = await supabase.rpc("pasugo_dispatch_accept", { _job_id: jobId });
  if (error) throw error;
  return (data ?? { ok: false }) as { ok: boolean; booking_id?: string; reason?: string };
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
        .from("pasugo_bookings" as never)
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
        .from("pasugo_bookings" as never)
        .select("*")
        .eq("customer_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PasugoBooking[];
    },
  });
}
