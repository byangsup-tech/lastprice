import { boundingBox, haversineMeters } from "./geo";
import {
  availability,
  childPerTeacher,
  type Daycare,
  type DaycareWithDistance,
  type SortKey,
} from "./types";

export interface DaycareQuery {
  lat: number;
  lng: number;
  radius: number;
  /** 유형 필터. "기타"는 국공립/민간/가정 외 전부 */
  types?: string[];
  bus?: boolean;
  cctv?: boolean;
  avail?: boolean;
  sort: SortKey;
}

const MAIN_TYPES = ["국공립", "민간", "가정"];
const MAX_RESULTS = 200;

function matchesType(d: Daycare, types: string[]): boolean {
  if (types.length === 0) return true;
  if (types.includes(d.type)) return true;
  if (types.includes("기타") && !MAIN_TYPES.includes(d.type)) return true;
  return false;
}

export function queryDaycares(
  all: Daycare[],
  q: DaycareQuery,
): DaycareWithDistance[] {
  const box = boundingBox(q.lat, q.lng, q.radius);

  let result: DaycareWithDistance[] = [];
  for (const d of all) {
    if (
      d.lat < box.minLat ||
      d.lat > box.maxLat ||
      d.lng < box.minLng ||
      d.lng > box.maxLng
    )
      continue;
    const distance = haversineMeters(q.lat, q.lng, d.lat, d.lng);
    if (distance > q.radius) continue;
    if (q.types && !matchesType(d, q.types)) continue;
    if (q.bus && !d.hasBus) continue;
    if (q.cctv && d.cctvCount <= 0) continue;
    if (q.avail && availability(d) <= 0) continue;
    result.push({ ...d, distance: Math.round(distance) });
  }

  result.sort((a, b) => {
    switch (q.sort) {
      case "avail":
        return availability(b) - availability(a) || a.distance - b.distance;
      case "ratio": {
        const ra = childPerTeacher(a) ?? Infinity;
        const rb = childPerTeacher(b) ?? Infinity;
        return ra - rb || a.distance - b.distance;
      }
      default:
        return a.distance - b.distance;
    }
  });

  if (result.length > MAX_RESULTS) result = result.slice(0, MAX_RESULTS);
  return result;
}
