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

export type SourceKind = "rss" | "naver-news" | "dart" | "scrape";

export interface SourceDef {
  id: string;
  name: string;
  category: CategoryKey;
  kind: SourceKind;
  lang: "ko" | "en";
  /** RSS 피드 URL (kind=rss) */
  url?: string;
  /** 네이버 뉴스 검색어 (kind=naver-news) */
  query?: string;
  /** 제목/요약에 이 중 하나라도 포함돼야 통과 (전사 피드에서 보험 항목만 걸러낼 때) */
  include?: string[];
  homepage?: string;
  /** 소스별 최대 수집 건수 (기본 20) */
  limit?: number;
}

export interface FeedItem {
  id: string;
  sourceId: string;
  sourceName: string;
  category: CategoryKey;
  title: string;
  url: string;
  summary?: string;
  /** ISO 8601 */
  publishedAt: string;
  lang: "ko" | "en";
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

export interface FeedResponse {
  items: FeedItem[];
  sources: SourceState[];
  generatedAt: string;
}
