import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface Props {
  lat: number;
  lng: number;
}

const riderIcon = L.divIcon({
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
      background:#f97316;
      color:white;
      box-shadow:0 4px 12px rgba(0,0,0,.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <path d="M5.5 17.5 9 9h5l4.5 8.5"/>
        <path d="M9 9 7 6h4"/>
        <path d="M14 9h3l2 3"/>
        <path d="M11 13h4"/>
      </svg>
    </div>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

export default function RiderMarker({ lat, lng }: Props) {
  return (
    <Marker position={[lat, lng]} icon={riderIcon}>
      <Popup>
        <div className="font-semibold">Rider</div>
      </Popup>
    </Marker>
  );
}
