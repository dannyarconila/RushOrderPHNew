import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface Props {
  lat: number;
  lng: number;
}

const customerIcon = L.divIcon({
  className: "rushorder-map-marker",
  html: `
    <div style="
      width:40px;
      height:40px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:50%;
      border:2px solid white;
      background:#475569;
      color:white;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m3 10 9-7 9 7"/>
        <path d="M5 9v11h14V9"/>
        <path d="M9 20v-6h6v6"/>
      </svg>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

export default function CustomerMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]} icon={customerIcon}>
      <Popup>
        <div className="font-semibold">Customer</div>
      </Popup>
    </Marker>
  );
}
