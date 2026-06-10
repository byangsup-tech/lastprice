"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { DaycareWithDistance } from "@/lib/types";
import { markerColor } from "@/lib/ui";

interface MapViewProps {
  center: { lat: number; lng: number };
  radius: number;
  daycares: DaycareWithDistance[];
  compareIds: string[];
  selectedId: string | null;
  onCenterChange: (lat: number, lng: number) => void;
  onMarkerClick: (id: string) => void;
}

/** 지도 탭 → 기준 위치 이동 */
function MapEvents({ onCenterChange }: Pick<MapViewProps, "onCenterChange">) {
  useMapEvents({
    click(e) {
      onCenterChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** 중심/반경 변경 시 반경 원이 화면에 들어오도록 재조정 */
function FitToRadius({ center, radius }: Pick<MapViewProps, "center" | "radius">) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center.lat, center.lng).toBounds(radius * 2);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, center.lat, center.lng, radius]);
  return null;
}

const centerPinIcon = L.divIcon({
  className: "leaflet-div-icon-clean",
  html: `<div style="font-size:30px;line-height:1;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))">📍</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

function daycareIcon(
  d: DaycareWithDistance,
  isCompared: boolean,
  isSelected: boolean,
): L.DivIcon {
  const color = markerColor(d.type);
  const ring = isSelected ? "box-shadow:0 0 0 3px #facc15;" : "";
  const check = isCompared
    ? `<div style="position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:9999px;background:#facc15;color:#1f2937;font-size:10px;line-height:14px;text-align:center;font-weight:700">✓</div>`
    : "";
  return L.divIcon({
    className: "leaflet-div-icon-clean",
    html: `<div style="position:relative;width:24px;height:24px;border-radius:9999px;background:${color};border:2px solid #fff;${ring}box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${d.type.charAt(0)}${check}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export default function MapView({
  center,
  radius,
  daycares,
  compareIds,
  selectedId,
  onCenterChange,
  onMarkerClick,
}: MapViewProps) {
  const centerLatLng = useMemo(
    () => [center.lat, center.lng] as [number, number],
    [center.lat, center.lng],
  );

  return (
    <MapContainer
      center={centerLatLng}
      zoom={15}
      className="h-full w-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents onCenterChange={onCenterChange} />
      <FitToRadius center={center} radius={radius} />

      <Circle
        center={centerLatLng}
        radius={radius}
        interactive={false}
        pathOptions={{ color: "#3b82f6", weight: 1.5, fillOpacity: 0.08 }}
      />

      <Marker
        position={centerLatLng}
        icon={centerPinIcon}
        draggable
        zIndexOffset={1000}
        eventHandlers={{
          dragend(e) {
            const pos = (e.target as L.Marker).getLatLng();
            onCenterChange(pos.lat, pos.lng);
          },
        }}
      />

      {daycares.map((d) => (
        <Marker
          key={d.id}
          position={[d.lat, d.lng]}
          icon={daycareIcon(d, compareIds.includes(d.id), selectedId === d.id)}
          eventHandlers={{
            click() {
              onMarkerClick(d.id);
            },
          }}
        />
      ))}
    </MapContainer>
  );
}
