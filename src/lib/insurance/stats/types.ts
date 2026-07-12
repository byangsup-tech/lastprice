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

/** 국고채 월별 금리 (%) — 예정이율·공시이율 검토용 컨텍스트 */
export interface InterestRatePoint {
  /** YYYY-MM */
  month: string;
  y3: number;
  y5: number;
  y10: number;
}

/** 다빈도 질병 — 연간 진료인원 (명) */
export interface FrequentDiseaseRow {
  disease: string;
  patients: number;
}

/** 암 조발생률 추이 — 인구 10만 명당 (전체/남/여) */
export interface CancerIncidencePoint {
  year: number;
  total: number;
  male: number;
  female: number;
}

/** 연령대별 주요 질환 진료인원 프로파일 */
export interface AgeProfileData {
  /** 예: "0–9", "10–19", …, "80+" */
  ageBands: string[];
  /** values는 ageBands와 같은 길이 — 단위: 만 명 (연간 진료인원) */
  series: { name: string; values: number[] }[];
}

/** 법정감염병 주간 신고 건수 */
export interface InfectiousDiseaseRow {
  disease: string;
  weeklyCases: number;
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
  /** 국고채 3/5/10년 월별 금리 */
  treasuryYields: StatsBlock<InterestRatePoint[]>;
  /** 다빈도 질병 진료인원 상위 */
  frequentDiseases: StatsBlock<FrequentDiseaseRow[]>;
  /** 암 조발생률 추이 */
  cancerIncidence: StatsBlock<CancerIncidencePoint[]>;
  /** 연령대별 주요 질환 프로파일 */
  ageProfile: StatsBlock<AgeProfileData>;
  /** 법정감염병 주간 신고 상위 */
  infectious: StatsBlock<InfectiousDiseaseRow[]>;
  tiles: StatTileData[];
  generatedAt: string;
}
