/**
 * Rider dispatch service layer.
 *
 * All decision logic (radius, fees, first-accept-wins locking, retries) lives
 * in database functions so every client — rider app, customer tracker, admin
 * console — reads and writes the exact same state.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type DispatchJob = Tables["dispatch_jobs"]["Row"] & {
  dispatch_type?: "marketplace" | "pasugo";
  customer_notes?: string | null;
};
export type DispatchOffer = Tables["dispatch_offers"]["Row"];
export type RiderStatus = Tables["rider_status"]["Row"];

export interface DispatchSettings {
  radiusKm: number;
  maxRadiusKm: number;
  feePerKm: number;
  minFee: number;
  maxFee: number;
  timeoutSeconds: number;
  retryIntervalSeconds: number;
  maxRetries: number;
  autoExpand: boolean;
  radiusExpansionKm: number;
  strategy: string;
}

export const DISPATCH_SETTING_KEYS = [
  "dispatch_radius_km",
  "dispatch_max_radius_km",
  "dispatch_fee_per_km",
  "dispatch_min_fee",
  "dispatch_max_fee",
  "dispatch_timeout_seconds",
  "dispatch_retry_interval_seconds",
  "dispatch_max_retries",
  "dispatch_auto_expand",
  "dispatch_radius_expansion_km",
  "dispatch_strategy",
] as const;

const numberOf = (raw: unknown, fallback: number) => {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseDispatchSettings(raw: Record<string, unknown>): DispatchSettings {
  return {
    radiusKm: numberOf(raw.dispatch_radius_km, 5),
    maxRadiusKm: numberOf(raw.dispatch_max_radius_km, 10),
    feePerKm: numberOf(raw.dispatch_fee_per_km, 0),
    minFee: numberOf(raw.dispatch_min_fee, 0),
    maxFee: numberOf(raw.dispatch_max_fee, 0),
    timeoutSeconds: numberOf(raw.dispatch_timeout_seconds, 30),
    retryIntervalSeconds: numberOf(raw.dispatch_retry_interval_seconds, 15),
    maxRetries: numberOf(raw.dispatch_max_retries, 5),
    autoExpand: raw.dispatch_auto_expand !== false,
    radiusExpansionKm: numberOf(raw.dispatch_radius_expansion_km, 2),
    strategy: typeof raw.dispatch_strategy === "string" ? raw.dispatch_strategy : "nearest_first",
  };
}

export function dispatchSettingsQuery() {
  return queryOptions({
    queryKey: ["dispatch-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<DispatchSettings> => {
      const { data, error } = await supabase.rpc("dispatch_settings");
      if (error) throw error;
      return parseDispatchSettings((data ?? {}) as Record<string, unknown>);
    },
  });
}

/** Estimated fee preview used by the rider and admin surfaces. */
export function quoteDispatchFee(distanceKm: number, settings: DispatchSettings): number {
  const raw = Math.round(distanceKm * settings.feePerKm * 100) / 100;
  return Math.max(settings.minFee, Math.min(settings.maxFee, raw));
}

/* ------------------------------------------------------------------ */
/* Rider presence                                                      */
/* ------------------------------------------------------------------ */

export function riderStatusQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["rider-status", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<RiderStatus | null> => {
      const { data, error } = await supabase
        .from("rider_status")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export async function setRiderPresence(online: boolean, coords?: GeolocationCoordinates | null) {
  console.debug("setRiderPresence: sending", { online, coords });
  const { data, error } = await supabase.rpc("rider_set_presence", {
    _online: online,
    _lat: coords ? Number(coords.latitude.toFixed(6)) : undefined,
    _lng: coords ? Number(coords.longitude.toFixed(6)) : undefined,
  });
  if (error) {
    console.error("setRiderPresence: error", { error, online, coords });
    throw error;
  }
  console.debug("setRiderPresence: success", { data, online, coords });
  return data as boolean;
}

/** Best-effort browser position; resolves to null when unavailable or denied. */
export function currentPosition(): Promise<GeolocationCoordinates | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15_000 },
    );
  });
}

export function watchRiderLocation(onUpdate: (coords: GeolocationCoordinates) => void) {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      onUpdate(position.coords);
    },
    (error) => {
      console.error("GPS Error:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 5000,
    },
  );

  return watchId;
}

export function stopWatchingLocation(watchId: number | null) {
  if (watchId !== null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
  }
}

/* ------------------------------------------------------------------ */
/* Offers and jobs                                                     */
/* ------------------------------------------------------------------ */

export interface OfferWithJob {
  offer: DispatchOffer;
  job: DispatchJob;
}

/** The rider's live booking request, if one is still pending. */
export function pendingOfferQuery(riderId: string | undefined) {
  return queryOptions({
    queryKey: ["dispatch-offer", riderId ?? null],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<OfferWithJob | null> => {
      const { data, error } = await supabase
        .from("dispatch_offers")
        .select("*, dispatch_jobs(*)")
        .eq("rider_id", riderId!)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { dispatch_jobs: job, ...offer } = data as DispatchOffer & {
        dispatch_jobs: DispatchJob | null;
      };
      if (!job || job.status !== "searching") return null;
      return { offer: offer as DispatchOffer, job };
    },
  });
}

/** The delivery the rider is currently working on. */
export function activeJobQuery(riderId: string | undefined) {
  return queryOptions({
    queryKey: ["dispatch-active-job", riderId ?? null],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<DispatchJob | null> => {
      const { data, error } = await supabase
        .from("dispatch_jobs")
        .select("*")
        .eq("assigned_rider_id", riderId!)
        .in("status", ["assigned", "picked_up"])
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DispatchJob | null;
    },
  });
}

/** Completed deliveries for the rider's stats. */
export function riderHistoryQuery(riderId: string | undefined) {
  return queryOptions({
    queryKey: ["dispatch-history", riderId ?? null],
    enabled: Boolean(riderId),
    queryFn: async (): Promise<DispatchJob[]> => {
      const { data, error } = await supabase
        .from("dispatch_jobs")
        .select("*")
        .eq("assigned_rider_id", riderId!)
        .eq("status", "delivered")
        .order("delivered_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Dispatch state for a single order (customer tracking). */
export function orderDispatchQuery(orderId: string) {
  return queryOptions({
    queryKey: ["dispatch-job", orderId],
    queryFn: async (): Promise<DispatchJob | null> => {
      const { data, error } = await supabase
        .from("dispatch_jobs")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DispatchJob | null;
    },
  });
}

export async function acceptDispatch(jobId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc("dispatch_accept", { _job_id: jobId });
  if (error) throw error;
  return (data ?? { ok: false }) as { ok: boolean; reason?: string };
}

export async function declineDispatch(jobId: string) {
  const { error } = await supabase.rpc("dispatch_decline", { _job_id: jobId });
  if (error) throw error;
}

export async function advanceDispatch(jobId: string, step: "picked_up" | "delivered") {
  const { error } = await supabase.rpc("dispatch_advance", { _job_id: jobId, _step: step });
  if (error) throw error;
}

/** Re-broadcasts an expired search (safe no-op when the job is still live). */
export async function retryDispatch(jobId: string) {
  const { error } = await supabase.rpc("dispatch_retry", { _job_id: jobId });
  if (error) throw error;
}

export function secondsLeft(expiresAt: string | null | undefined): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

/* ------------------------------------------------------------------ */
/* Realtime tracking                                                   */
/* ------------------------------------------------------------------ */

export function watchDispatchJob(orderId: string, onChange: () => void) {
  const channel = supabase.channel(`dispatch-job-${orderId}`).on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "dispatch_jobs",
      filter: `order_id=eq.${orderId}`,
    },
    (payload) => {
      console.debug("watchDispatchJob: payload", { orderId, payload });
      onChange();
    },
  );

  channel.subscribe();
  return channel;
}

export function watchAssignedRider(
  riderId: string,
  onChange: (location: { lat: number; lng: number } | null) => void,
) {
  async function fetchCurrentLocation() {
    const { data, error } = await supabase
      .from("rider_status")
      .select("latitude,longitude")
      .eq("user_id", riderId)
      .maybeSingle();

    console.debug("watchAssignedRider: fetched current location", { riderId, data, error });

    if (!error && data && data.latitude != null && data.longitude != null) {
      onChange({ lat: Number(data.latitude), lng: Number(data.longitude) });
    } else {
      onChange(null);
    }
  }

  void fetchCurrentLocation();

  const channel = supabase.channel(`rider-location-${riderId}`).on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "rider_status",
      filter: `user_id=eq.${riderId}`,
    },
    (payload) => {
      console.debug("watchAssignedRider: realtime payload", { riderId, payload });
      const row = payload.new as { latitude: number | null; longitude: number | null } | null;
      if (row && row.latitude != null && row.longitude != null) {
        onChange({ lat: Number(row.latitude), lng: Number(row.longitude) });
      } else {
        onChange(null);
      }
    },
  );

  // Subscribe and return the channel so callers can remove it with supabase.removeChannel(channel)
  channel.subscribe();
  return channel;
}

export function removeRealtime(channel: ReturnType<typeof supabase.channel>) {
  void supabase.removeChannel(channel);
}
