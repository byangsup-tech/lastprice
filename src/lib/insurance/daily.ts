import type { CategoryKey, FeedItem } from "./types";

/** 관심 키워드·오늘의 브리핑 — 순수 함수 (클라이언트에서 사용, 픽스처 테스트 대상) */

/** 아이템에 매칭되는 관심 키워드 목록 (대소문자 무시) */
export function matchedKeywords(item: FeedItem, keywords: string[]): string[] {
  if (!keywords.length) return [];
  const haystack =
    `${item.title} ${item.titleKo ?? ""} ${item.summary ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase();
  return keywords.filter((kw) => haystack.includes(kw.toLowerCase()));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 브리핑 중요도 가중치 — 상품개발 실무 직결도 기준 */
const CATEGORY_WEIGHT: Record<CategoryKey, number> = {
  policy: 2,
  "new-products": 2,
  "risk-research": 1.5,
  "kr-news": 1,
  research: 1,
  "global-news": 0.5,
};

/**
 * 뉴닉식 완독형 브리핑 — 지난 24시간 신규 중 "꼭 볼 n건"을 중요도순으로.
 * 점수 = 관심 키워드 매칭(+3) + 카테고리 가중치 + 최신성(0~1).
 */
export function dailyTopPicks(
  items: FeedItem[],
  keywords: string[],
  now = Date.now(),
  n = 7,
): FeedItem[] {
  const cutoff = now - DAY_MS;
  return items
    .filter((item) => {
      const t = Date.parse(item.publishedAt);
      return Number.isFinite(t) && t >= cutoff && t <= now + 60_000;
    })
    .map((item) => {
      const t = Date.parse(item.publishedAt);
      const score =
        (matchedKeywords(item, keywords).length > 0 ? 3 : 0) +
        (CATEGORY_WEIGHT[item.category] ?? 0) +
        (t - cutoff) / DAY_MS;
      return { item, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.publishedAt.localeCompare(a.item.publishedAt),
    )
    .slice(0, n)
    .map((s) => s.item);
}

export interface BriefingEntry {
  category: CategoryKey;
  count: number;
  /** 최신순 상위 헤드라인 */
  top: FeedItem[];
}

/** 지난 24시간 신규 항목을 카테고리별로 요약 (건수 내림차순) */
export function briefingByCategory(
  items: FeedItem[],
  now = Date.now(),
  topN = 3,
): BriefingEntry[] {
  const cutoff = now - DAY_MS;
  const byCategory = new Map<CategoryKey, FeedItem[]>();
  for (const item of items) {
    const t = Date.parse(item.publishedAt);
    if (!Number.isFinite(t) || t < cutoff || t > now + 60_000) continue;
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      count: list.length,
      top: list
        .slice()
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, topN),
    }))
    .sort((a, b) => b.count - a.count);
}
