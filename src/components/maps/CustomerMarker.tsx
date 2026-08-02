import { Marker, Popup } from "react-leaflet";

interface Props {
  lat: number;
  lng: number;
}

export default function CustomerMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]}>
      <Popup>🏠 Customer</Popup>
    </Marker>
  );
}
