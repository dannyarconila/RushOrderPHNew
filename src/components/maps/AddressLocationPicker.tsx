import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";
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

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        onChange({ lat, lng });

        toast.success("Current location detected", {
          description: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        });
      },
      (error) => {
        toast.error("Could not get your current location", {
          description:
            error.code === error.PERMISSION_DENIED
              ? "Please allow location access for RushOrder PH."
              : "Please try again or tap the map to set your delivery location.",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
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
