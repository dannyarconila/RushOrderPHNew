import { Marker, Popup } from "react-leaflet";

interface Props {
  lat: number;
  lng: number;
}

export default function RiderMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]}>
      <Popup>🚴 Rider</Popup>
    </Marker>
  );
}
