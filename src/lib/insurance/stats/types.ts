/** 위험률 통계 패널 타입 */

export interface LifeExpectancyPoint {
  year: number;
  total: number;
  male: number;
  female: number;
}

export interface DeathCauseRow {
  cause: string;
  /** 인구 10만 명당 사망률 */
  ratePer100k: number;
}

export type StatsBlockStatus = "live" | "stale" | "demo";

export interface StatsBlock<T> {
  status: StatsBlockStatus;
  /** demo일 때 사유 (키 미설정 / 수집 실패 등) */
  note?: string;
  data: T;
}

export interface StatTileData {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}

export interface StatsResponse {
  /** 기대수명 추이 (전체/남/여) */
  lifeExpectancy: StatsBlock<LifeExpectancyPoint[]>;
  /** 최신 연도 사망원인별 사망률 상위 */
  deathCauses: StatsBlock<DeathCauseRow[]>;
  deathCausesYear: number;
  tiles: StatTileData[];
  generatedAt: string;
}
