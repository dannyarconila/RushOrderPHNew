import "./leaflet-icons";
import { MapContainer, Polyline, TileLayer } from "react-leaflet";
import { useMemo } from "react";

import CustomerMarker from "./CustomerMarker";
import RiderMarker from "./RiderMarker";
import StoreMarker from "./StoreMarker";
import FitBounds from "./FitBounds";
import type { DispatchJob } from "@/lib/dispatch";

interface Coordinate {
  lat: number;
  lng: number;
}

interface LiveDeliveryMapJob {
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  status: string;
}

interface LiveDeliveryMapProps {
  dispatchJob?: LiveDeliveryMapJob | null;
  riderLocation?: Coordinate | null;
}

function haversineDistance(a: Coordinate, b: Coordinate) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export default function LiveDeliveryMap({ dispatchJob, riderLocation }: LiveDeliveryMapProps) {
  // derive store/customer locations from the dispatch job if present
  const storeLocation = useMemo(() => {
    if (!dispatchJob) return null;
    const { pickup_lat, pickup_lng } = dispatchJob;
    if (pickup_lat == null || pickup_lng == null) return null;
    return { lat: pickup_lat, lng: pickup_lng } as Coordinate;
  }, [dispatchJob]);

  const customerLocation = useMemo(() => {
    if (!dispatchJob) return null;
    const { dropoff_lat, dropoff_lng } = dispatchJob;
    if (dropoff_lat == null || dropoff_lng == null) return null;
    return { lat: dropoff_lat, lng: dropoff_lng } as Coordinate;
  }, [dispatchJob]);

  const route = useMemo(() => {
    if (!storeLocation || !customerLocation) return [];
    return riderLocation
      ? [riderLocation, storeLocation, customerLocation]
      : [storeLocation, customerLocation];
  }, [customerLocation, riderLocation, storeLocation]);

  const remainingDistance = useMemo(() => {
    if (!storeLocation || !customerLocation) return null;
    if (!riderLocation) return haversineDistance(storeLocation, customerLocation);
    if (dispatchJob?.status === "picked_up") {
      return haversineDistance(riderLocation, customerLocation);
    }
    return (
      haversineDistance(riderLocation, storeLocation) +
      haversineDistance(storeLocation, customerLocation)
    );
  }, [customerLocation, dispatchJob?.status, riderLocation, storeLocation]);

  const etaMinutes = useMemo(() => {
    if (remainingDistance == null) return null;
    const speedKmh = 25;
    return Math.max(1, Math.round((remainingDistance / speedKmh) * 60));
  }, [remainingDistance]);

  const center =
    riderLocation ??
    customerLocation ??
    storeLocation ??
    ({ lat: 14.5995, lng: 120.9842 } as Coordinate);

  return (
    <div className="relative">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        scrollWheelZoom
        className="h-[400px] w-full rounded-xl"
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds
          riderLocation={riderLocation}
          customerLocation={customerLocation}
          storeLocation={storeLocation}
        />

        {route.length > 1 ? (
          <Polyline
            positions={route.map((point) => [point.lat, point.lng] as [number, number])}
            pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.7 }}
          />
        ) : null}

        {storeLocation && <StoreMarker lat={storeLocation.lat} lng={storeLocation.lng} />}

        {customerLocation && (
          <CustomerMarker lat={customerLocation.lat} lng={customerLocation.lng} />
        )}

        {riderLocation && <RiderMarker lat={riderLocation.lat} lng={riderLocation.lng} />}
      </MapContainer>

      {(remainingDistance != null || etaMinutes != null) && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-2xl bg-white/90 p-3 text-xs shadow-lg backdrop-blur-sm">
          {remainingDistance != null ? (
            <p className="font-semibold text-slate-950">Remaining distance</p>
          ) : null}
          {remainingDistance != null ? <p>{remainingDistance.toFixed(1)} km</p> : null}
          {etaMinutes != null ? <p className="mt-1">ETA: {etaMinutes} min</p> : null}
        </div>
      )}
    </div>
  );
}
