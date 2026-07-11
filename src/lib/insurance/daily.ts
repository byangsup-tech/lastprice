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
