export interface Daycare {
  id: string;
  name: string;
  /** 국공립 | 사회복지법인 | 법인·단체등 | 민간 | 가정 | 협동 | 직장 */
  type: string;
  /** 정상 | 휴지 | 폐지 */
  status: string;
  address: string;
  tel: string;
  homepage?: string;
  /** 정원 */
  capacity: number;
  /** 현원 */
  current: number;
  /** 보육교직원 수 */
  staffCount: number;
  /** 보육실 수 */
  roomCount: number;
  /** 보육실 면적(㎡) */
  roomArea?: number;
  /** 놀이터 수 */
  playgroundCount: number;
  /** CCTV 설치 수 */
  cctvCount: number;
  /** 통학차량 운영 여부 */
  hasBus: boolean;
  /** 인가일자 (YYYY-MM-DD) */
  approvedAt?: string;
  lat: number;
  lng: number;
  sido: string;
  sigungu: string;
}

export type DataSource = "live" | "demo" | "stale";

export interface DaycareWithDistance extends Daycare {
  /** 기준 위치로부터의 거리(m) */
  distance: number;
}

export interface DaycaresResponse {
  source: DataSource;
  count: number;
  items: DaycareWithDistance[];
}

export type SortKey = "distance" | "avail" | "ratio";

export const RADIUS_OPTIONS = [500, 1000, 2000, 3000] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

/** 유형 필터 칩 값. "기타"는 국공립/민간/가정 외 전부 */
export const TYPE_FILTERS = ["국공립", "민간", "가정", "기타"] as const;

/** 정원 여유 (음수 방지) */
export function availability(d: Daycare): number {
  return Math.max(0, d.capacity - d.current);
}

/** 교사 1인당 아동 수. 교직원 수 0이면 null */
export function childPerTeacher(d: Daycare): number | null {
  if (d.staffCount <= 0) return null;
  return Math.round((d.current / d.staffCount) * 10) / 10;
}
