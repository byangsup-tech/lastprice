/** 보험 상품개발 대시보드 — 피드 공통 타입 */

export const CATEGORIES = [
  "kr-news",
  "global-news",
  "policy",
  "new-products",
  "research",
] as const;

export type CategoryKey = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  "kr-news": "국내 뉴스",
  "global-news": "해외 뉴스",
  policy: "정책·공시",
  "new-products": "신상품",
  research: "리서치",
};

export type SourceKind = "rss" | "naver-news" | "dart" | "scrape" | "assembly";

export type Lang = "ko" | "en" | "ja" | "zh";

/** 신상품 시장 구분 */
export type Market = "KR" | "CN" | "JP" | "GLOBAL";

export const MARKETS: Market[] = ["KR", "CN", "JP", "GLOBAL"];

export const MARKET_LABELS: Record<Market, string> = {
  KR: "🇰🇷 한국",
  CN: "🇨🇳 중국",
  JP: "🇯🇵 일본",
  GLOBAL: "🌐 글로벌",
};

export interface SourceDef {
  id: string;
  name: string;
  category: CategoryKey;
  kind: SourceKind;
  lang: Lang;
  /** RSS 피드 URL (kind=rss) */
  url?: string;
  /** 네이버 뉴스 검색어 (kind=naver-news) */
  query?: string;
  /** 제목/요약에 이 중 하나라도 포함돼야 통과 (전사 피드에서 보험 항목만 걸러낼 때) */
  include?: string[];
  homepage?: string;
  /** 소스별 최대 수집 건수 (기본 20) */
  limit?: number;
  /** 신상품 소스의 시장 구분 */
  market?: Market;
  /** 요약이 제목 중복에 불과한 피드(Google News 등)는 버린다 */
  noSummary?: boolean;
}

export interface FeedItem {
  id: string;
  sourceId: string;
  sourceName: string;
  category: CategoryKey;
  title: string;
  /** 한국어 자동 번역 제목 (원문이 비한국어일 때) */
  titleKo?: string;
  url: string;
  summary?: string;
  /** ISO 8601 */
  publishedAt: string;
  lang: Lang;
  /** 신상품 시장 구분 */
  market?: Market;
  /** 상품 유형 자동 태그 (신상품 카테고리) */
  tags?: string[];
  /** 데모(예시) 데이터 여부 — UI에서 명시적으로 표시 */
  demo?: boolean;
}

export type SourceStatus =
  | "live" // 방금 수집 성공
  | "stale" // 수집 실패 → 만료된 캐시로 대체
  | "error" // 수집 실패, 캐시도 없음
  | "no-key" // API 키 미설정
  | "demo"; // 데모 데이터로 대체

export interface SourceState {
  id: string;
  name: string;
  category: CategoryKey;
  status: SourceStatus;
  count: number;
  fetchedAt?: string;
  error?: string;
}

/** 제목 자동 번역 상태 */
export type TranslationStatus = "on" | "no-key" | "error";

export interface FeedResponse {
  items: FeedItem[];
  sources: SourceState[];
  translation: TranslationStatus;
  generatedAt: string;
}
