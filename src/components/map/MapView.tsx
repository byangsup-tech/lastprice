"use client";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import "leaflet.markercluster";
import { useEffect, useMemo, useRef } from "react";
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

function clusterIcon(cluster: { getChildCount(): number }): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count >= 50 ? 40 : count >= 10 ? 34 : 28;
  return L.divIcon({
    className: "leaflet-div-icon-clean",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#2563eb;border:3px solid rgba(255,255,255,.85);box-shadow:0 1px 6px rgba(0,0,0,.35);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** 밀집 지역(실데이터 기준 수백 곳)에서 마커 겹침을 막기 위한 클러스터 레이어 */
function ClusteredDaycareMarkers({
  daycares,
  compareIds,
  selectedId,
  onMarkerClick,
}: Pick<MapViewProps, "daycares" | "compareIds" | "selectedId" | "onMarkerClick">) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const onClickRef = useRef(onMarkerClick);
  useEffect(() => {
    onClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 44,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: clusterIcon,
    });
    map.addLayer(group);
    groupRef.current = group;
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    for (const d of daycares) {
      const marker = L.marker([d.lat, d.lng], {
        icon: daycareIcon(d, compareIds.includes(d.id), selectedId === d.id),
      });
      marker.on("click", () => onClickRef.current(d.id));
      group.addLayer(marker);
    }
  }, [daycares, compareIds, selectedId]);

  return null;
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
      doubleClickZoom={false}
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

      <ClusteredDaycareMarkers
        daycares={daycares}
        compareIds={compareIds}
        selectedId={selectedId}
        onMarkerClick={onMarkerClick}
      />
    </MapContainer>
  );
}
