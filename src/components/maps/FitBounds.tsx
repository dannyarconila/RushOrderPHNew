import { useEffect } from "react";
import { LatLngBounds } from "leaflet";
import { useMap } from "react-leaflet";

interface Coordinate {
  lat: number;
  lng: number;
}

interface FitBoundsProps {
  riderLocation?: Coordinate | null;
  customerLocation?: Coordinate | null;
  storeLocation?: Coordinate | null;
}

export default function FitBounds({
  riderLocation,
  customerLocation,
  storeLocation,
}: FitBoundsProps) {
  const map = useMap();

  useEffect(() => {
    const points = [riderLocation, customerLocation, storeLocation].filter(Boolean) as Coordinate[];

    if (points.length === 0) return;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
      return;
    }

    const bounds = new LatLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));

    map.fitBounds(bounds, {
      padding: [60, 60],
    });
  }, [map, riderLocation, customerLocation, storeLocation]);

  return null;
}
