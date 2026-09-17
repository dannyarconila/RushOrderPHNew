import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getCurrentLocation } from "@/lib/geolocation";

import "./leaflet-icons";

interface Coordinate {
  lat: number;
  lng: number;
}

interface AddressLocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (coordinate: Coordinate) => void;
}

const DEFAULT_CENTER: Coordinate = {
  lat: 7.0731,
  lng: 125.6128,
};

const destinationIcon = L.divIcon({
  className: "destination-map-pin",
  html: `
    <div style="
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9999px;
      background: hsl(var(--primary));
      color: white;
      border: 3px solid white;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
    ">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/>
        <circle cx="12" cy="10" r="2.5"/>
      </svg>
    </div>
  `,
  iconSize: [42, 42],
  iconAnchor: [21, 21],
});



function MapClickHandler({ onChange }: { onChange: (coordinate: Coordinate) => void }) {
  useMapEvents({
    click(event) {
      onChange({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    },
  });

  return null;
}

function RecenterMap({ coordinate }: { coordinate: Coordinate }) {
  const map = useMap();

  useEffect(() => {
    map.setView([coordinate.lat, coordinate.lng], Math.max(map.getZoom(), 16));
  }, [coordinate.lat, coordinate.lng, map]);

  return null;
}

export default function AddressLocationPicker({
  latitude,
  longitude,
  onChange,
}: AddressLocationPickerProps) {
  const coordinate = useMemo<Coordinate>(
    () =>
      latitude != null && longitude != null ? { lat: latitude, lng: longitude } : DEFAULT_CENTER,
    [latitude, longitude],
  );

  async function useCurrentLocation() {
    try {
      const coords = await getCurrentLocation();

      const lat = coords.latitude;
      const lng = coords.longitude;

      onChange({
        lat,
        lng,
      });

      toast.success("Current location detected", {
        description: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      });
    } catch (error) {
      const geolocationError = error as GeolocationPositionError;

      toast.error("Could not get your current location", {
        description:
          geolocationError.code === geolocationError.PERMISSION_DENIED
            ? "Please allow location access for RushOrder PH."
            : "Please try again or tap the map to set your delivery location.",
      });
    }
  }

  return (
    <div className="sm:col-span-2 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Delivery location</p>
          <p className="text-xs text-muted-foreground">
            Tap the map or use your current location to place the delivery pin.
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}>
          <LocateFixed className="size-4" />
          Use my location
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={[coordinate.lat, coordinate.lng]}
          zoom={coordinate === DEFAULT_CENTER ? 13 : 16}
          scrollWheelZoom
          className="h-[320px] w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onChange={onChange} />

          <RecenterMap coordinate={coordinate} />

          <Marker
            position={[coordinate.lat, coordinate.lng]}
            icon={destinationIcon}
            draggable
            eventHandlers={{
              dragend(event) {
                const marker = event.target;
                const position = marker.getLatLng();

                onChange({
                  lat: position.lat,
                  lng: position.lng,
                });
              },
            }}
          />
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-lg bg-background/95 px-3 py-2 text-xs shadow">
          <div className="flex items-center gap-1.5 font-medium">
            <MapPin className="size-3.5" />
            Delivery pin
          </div>
        </div>
      </div>

      {latitude != null && longitude != null ? (
        <p className="text-xs text-muted-foreground">
          Location saved: {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </p>
      ) : (
        <p className="text-xs font-medium text-destructive">
          Please select your delivery location on the map.
        </p>
      )}
    </div>
  );
}
