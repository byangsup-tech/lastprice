/**
 * 양자 산업 미국 vs 중국 대시보드 — 정적 큐레이션 데이터
 *
 * 시총/밸류에이션 지표는 가능하면 실시간 API(quantum-quotes.ts)로 덮어쓰고,
 * 네트워크가 막히거나 실패하면 아래 SNAPSHOT 값으로 폴백한다(어린이집 앱의 demo 폴백과 동일 사상).
 * 수치는 공개 자료 기반 "추정치"이며 투자자문이 아니다. (출처: SOURCES)
 */

export type Faction = "US" | "CN";

/** 양자 밸류체인 단계 (비교의 핵심 축) */
export type StageId =
  | "materials" // 소재·부품·장비
  | "hardware" // 하드웨어·프로세서
  | "software" // 소프트웨어·미들웨어
  | "cloud" // 클라우드·플랫폼
  | "applications"; // 응용·서비스

export interface ValueChainStage {
  id: StageId;
  /** 한글 명칭 */
  label: string;
  /** 한 줄 설명 */
  desc: string;
  /** 이모지 아이콘 */
  icon: string;
}

/** 양자 밸류체인 5단계 정의 (대시보드 비교 축) */
export const VALUE_CHAIN: ValueChainStage[] = [
  {
    id: "materials",
    label: "소재·부품·장비",
    desc: "극저온 냉동기, 제어전자, 레이저/광학, 특수소재, 칩 제조",
    icon: "🧊",
  },
  {
    id: "hardware",
    label: "하드웨어·프로세서",
    desc: "초전도·이온트랩·광양자·중성원자·어닐링 큐비트 시스템",
    icon: "⚛️",
  },
  {
    id: "software",
    label: "소프트웨어·미들웨어",
    desc: "SDK, 오류정정, 컴파일러, 알고리즘 라이브러리",
    icon: "💻",
  },
  {
    id: "cloud",
    label: "클라우드·플랫폼",
    desc: "양자 클라우드 접근·서비스",
    icon: "☁️",
  },
  {
    id: "applications",
    label: "응용·서비스",
    desc: "양자통신/QKD, 양자센싱, 산업별(금융·제약·물류) 응용",
    icon: "🔐",
  },
];

export const STAGE_LABEL: Record<StageId, string> = Object.fromEntries(
  VALUE_CHAIN.map((s) => [s.id, s.label]),
) as Record<StageId, string>;

export interface Company {
  /** 거래소 티커 (실시간 조회 키). 비상장은 "-" */
  ticker: string;
  /** 표시 이름 */
  name: string;
  /** 한글 보조 라벨 */
  nameKo: string;
  faction: Faction;
  /** 상장 여부 (false = 국유·비상장 → 시총 비교에서 제외) */
  listed: boolean;
  /** 점유 밸류체인 단계(복수 가능) */
  stages: StageId[];
  /** 큐비트/기술 방식 */
  tech: string;
  /** 한 줄 소개 */
  blurb: string;
  /** 거래 통화 (시총 정규화용) */
  currency?: "USD" | "CNY";
}

/**
 * 순수 양자 기업 마스터.
 * 미국: 다수의 순수 양자 상장사. 중국: 상장 순수 플레이어는 소수(国盾量子)이고
 * 본원/国仪 등 핵심 기업 다수는 국유·비상장 → 상장 구조의 비대칭이 핵심 내러티브.
 */
export const COMPANIES: Company[] = [
  // ── 미국 (상장) ─────────────────────────────────────────────
  {
    ticker: "IONQ",
    name: "IonQ",
    nameKo: "아이온큐",
    faction: "US",
    listed: true,
    stages: ["hardware", "software", "cloud"],
    tech: "이온트랩",
    blurb: "이온트랩 방식 선두 순수 양자기업, 클라우드 서비스 운영",
    currency: "USD",
  },
  {
    ticker: "RGTI",
    name: "Rigetti Computing",
    nameKo: "리게티",
    faction: "US",
    listed: true,
    stages: ["materials", "hardware", "software", "cloud"],
    tech: "초전도",
    blurb: "자체 칩 팹(Fab-1) 보유한 초전도 큐비트 풀스택 기업",
    currency: "USD",
  },
  {
    ticker: "QBTS",
    name: "D-Wave Quantum",
    nameKo: "디웨이브",
    faction: "US",
    listed: true,
    stages: ["hardware", "software", "cloud", "applications"],
    tech: "양자어닐링",
    blurb: "양자어닐링 상용화 선두, 최적화 응용 중심",
    currency: "USD",
  },
  {
    ticker: "QUBT",
    name: "Quantum Computing Inc.",
    nameKo: "퀀텀컴퓨팅",
    faction: "US",
    listed: true,
    stages: ["materials", "hardware", "applications"],
    tech: "광양자(박막 리튬나이오베이트)",
    blurb: "광자칩·양자센싱 등 광기반 양자 부품·시스템",
    currency: "USD",
  },
  {
    ticker: "ARQQ",
    name: "Arqit Quantum",
    nameKo: "아킷",
    faction: "US",
    listed: true,
    stages: ["software", "applications"],
    tech: "양자보안(QKD 소프트웨어)",
    blurb: "양자내성·대칭키 기반 양자보안 소프트웨어 (英 본사, 美 상장)",
    currency: "USD",
  },
  // ── 중국 (상장) ─────────────────────────────────────────────
  {
    ticker: "688027.SS",
    name: "QuantumCTek (国盾量子)",
    nameKo: "궈둔량자",
    faction: "CN",
    listed: true,
    stages: ["materials", "hardware", "applications"],
    tech: "양자통신/QKD 장비",
    blurb: "중국 대표 순수 양자 상장사, QKD 장비·양자통신 네트워크",
    currency: "CNY",
  },
  // ── 중국 (국유·비상장 핵심 플레이어 — 시총 비교 제외, 비대칭 내러티브) ──
  {
    ticker: "-",
    name: "Origin Quantum (本源量子)",
    nameKo: "오리진(본원)",
    faction: "CN",
    listed: false,
    stages: ["materials", "hardware", "software", "cloud"],
    tech: "초전도",
    blurb: "중국 초전도 양자컴퓨터 대표 기업 — 국가 주도·비상장",
  },
  {
    ticker: "-",
    name: "CIQTEK (国仪量子)",
    nameKo: "궈이량자",
    faction: "CN",
    listed: false,
    stages: ["materials", "hardware", "applications"],
    tech: "양자센싱·계측",
    blurb: "양자정밀측정·센싱 장비 — 비상장",
  },
  {
    ticker: "-",
    name: "TuringQ (图灵量子)",
    nameKo: "튜링량자",
    faction: "CN",
    listed: false,
    stages: ["hardware", "software"],
    tech: "광양자",
    blurb: "광양자 컴퓨팅·광자칩 — 비상장",
  },
];

/** 상장 순수 양자기업 티커 목록 (실시간 시세 조회 대상) */
export const LISTED_TICKERS: string[] = COMPANIES.filter(
  (c) => c.listed && c.ticker !== "-",
).map((c) => c.ticker);

export function companyByTicker(ticker: string): Company | undefined {
  return COMPANIES.find((c) => c.ticker === ticker);
}

// ── 진영 색상/라벨 (한 곳에서 정의) ──────────────────────────────
export const FACTION_COLOR: Record<Faction, string> = {
  US: "#2563eb", // 파랑
  CN: "#dc2626", // 빨강
};
export const FACTION_LABEL: Record<Faction, string> = {
  US: "🇺🇸 미국",
  CN: "🇨🇳 중국",
};

// ── 환율 (중국 A주 시총 → USD 정규화용) ─────────────────────────
export const CNY_PER_USD = 7.2; // 추정, asOf 2026-06
export function toUsd(value: number, currency?: string): number {
  if (currency === "CNY") return value / CNY_PER_USD;
  return value;
}

// ── 시장 규모(TAM) 전망 — "얼마나 더 커질까" ─────────────────────
export interface TamPoint {
  year: number;
  /** 시장 규모 추정 (10억 달러, USD) */
  low: number;
  high: number;
}

/** 양자컴퓨팅 시장 규모 전망 (공개 리포트 기반 추정 레인지, 단위: 10억 USD) */
export const QUANTUM_TAM: TamPoint[] = [
  { year: 2025, low: 4, high: 9 },
  { year: 2030, low: 28, high: 45 },
  { year: 2035, low: 90, high: 170 },
  { year: 2040, low: 200, high: 850 },
];

/** 양자기술 전체가 창출할 가치 (McKinsey 등 추정) */
export const QUANTUM_VALUE_2035_TRILLION_USD = 1.3;

// ── 폴백 시세/밸류에이션 스냅샷 (라이브 실패 시 사용) ────────────
export interface QuoteSnapshot {
  ticker: string;
  currency: "USD" | "CNY";
  /** 현지 통화 시가총액 (10억 단위) */
  marketCap: number;
  price: number;
  /** 주가매출비율 (P/S) */
  priceToSales: number | null;
  /** PER (적자기업은 null) */
  trailingPE: number | null;
  /** 매출 성장률 (전년比, 소수) */
  revenueGrowth: number | null;
  /** 애널리스트 평균 목표주가 대비 상승여력 (소수) */
  targetUpside: number | null;
}

/**
 * 폴백 스냅샷. 공개 자료 기반 대략치이며 기준일(SNAPSHOT_AS_OF)을 UI에 명시한다.
 * 라이브 연동 성공 시 이 값은 무시된다.
 */
export const SNAPSHOT_AS_OF = "2026-06-01";

export const QUOTE_SNAPSHOT: Record<string, QuoteSnapshot> = {
  IONQ: {
    ticker: "IONQ",
    currency: "USD",
    marketCap: 9.5,
    price: 38,
    priceToSales: 180,
    trailingPE: null,
    revenueGrowth: 0.85,
    targetUpside: -0.1,
  },
  RGTI: {
    ticker: "RGTI",
    currency: "USD",
    marketCap: 4.2,
    price: 14,
    priceToSales: 350,
    trailingPE: null,
    revenueGrowth: 0.3,
    targetUpside: 0.05,
  },
  QBTS: {
    ticker: "QBTS",
    currency: "USD",
    marketCap: 4.5,
    price: 14,
    priceToSales: 320,
    trailingPE: null,
    revenueGrowth: 1.2,
    targetUpside: 0.1,
  },
  QUBT: {
    ticker: "QUBT",
    currency: "USD",
    marketCap: 2.3,
    price: 16,
    priceToSales: 900,
    trailingPE: null,
    revenueGrowth: 0.5,
    targetUpside: -0.3,
  },
  ARQQ: {
    ticker: "ARQQ",
    currency: "USD",
    marketCap: 0.45,
    price: 28,
    priceToSales: 90,
    trailingPE: null,
    revenueGrowth: 0.4,
    targetUpside: 0.2,
  },
  "688027.SS": {
    ticker: "688027.SS",
    currency: "CNY",
    marketCap: 35, // 위안 기준 (≈ $4.9B)
    price: 130,
    priceToSales: 60,
    trailingPE: null,
    revenueGrowth: 0.2,
    targetUpside: 0,
  },
};

// ── 출처 ────────────────────────────────────────────────────────
export interface Source {
  label: string;
  url: string;
  note?: string;
}

export const SOURCES: Source[] = [
  {
    label: "McKinsey — Quantum Technology Monitor",
    url: "https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/quantum-technology-monitor",
    note: "시장 규모·가치 창출 전망",
  },
  {
    label: "BCG — Quantum Computing market outlook",
    url: "https://www.bcg.com/publications/2024/long-term-forecast-for-quantum-computing",
    note: "2040 시장 규모 전망",
  },
  {
    label: "각 기업 IR / 거래소 공시",
    url: "https://www.sec.gov/edgar/searchedgar/companysearch",
    note: "시총·매출·밸류에이션 지표",
  },
  {
    label: "실시간 시세: Yahoo Finance",
    url: "https://finance.yahoo.com/",
    note: "marketCap·P/S·목표주가·시계열 (가용 시)",
  },
];
