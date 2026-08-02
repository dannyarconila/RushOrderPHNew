import { Marker, Popup } from "react-leaflet";

interface Props {
  lat: number;
  lng: number;
}

export default function StoreMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]}>
      <Popup>🏪 Store</Popup>
    </Marker>
  );
}
