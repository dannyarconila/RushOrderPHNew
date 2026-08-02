import { MapContainer, TileLayer } from "react-leaflet";
import { useMemo } from "react";

import CustomerMarker from "./CustomerMarker";
import RiderMarker from "./RiderMarker";
import StoreMarker from "./StoreMarker";
import FitBounds from "./FitBounds";

interface Coordinate {
  lat: number;
  lng: number;
}

interface DispatchJobLocation {
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
}

interface LiveDeliveryMapProps {
  dispatchJob?: DispatchJobLocation | null;
  riderLocation?: Coordinate | null;
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

  const center = riderLocation ??
    customerLocation ??
    storeLocation ?? { lat: 14.5995, lng: 120.9842 };

  return (
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

      {storeLocation && <StoreMarker lat={storeLocation.lat} lng={storeLocation.lng} />}

      {customerLocation && <CustomerMarker lat={customerLocation.lat} lng={customerLocation.lng} />}

      {riderLocation && <RiderMarker lat={riderLocation.lat} lng={riderLocation.lng} />}
    </MapContainer>
  );
}
