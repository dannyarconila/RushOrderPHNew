import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface Props {
  lat: number;
  lng: number;
}

const storeIcon = L.divIcon({
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
      background:#2563eb;
      color:white;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 21h18"/>
        <path d="M5 21V8l7-5 7 5v13"/>
        <path d="M9 21v-4h6v4"/>
        <path d="M9 10h.01"/>
        <path d="M15 10h.01"/>
        <path d="M9 14h.01"/>
        <path d="M15 14h.01"/>
      </svg>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

export default function StoreMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]} icon={storeIcon}>
      <Popup>
        <div className="font-semibold">Seller / Store</div>
      </Popup>
    </Marker>
  );
}
