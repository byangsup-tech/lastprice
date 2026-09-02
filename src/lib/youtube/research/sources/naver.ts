import { hasNaverKeys, searchNaverNews } from "@/lib/insurance/naver";
import type { ParsedFeedItem } from "@/lib/insurance/rss";
import type { RawSignal } from "../../types";
import { clamp01 } from "../../util";
import { freshnessFromDate } from "../score";

/**
 * 네이버 뉴스 검색 (NAVER_CLIENT_ID/SECRET 필요) — 상위 후보 15개의 기사 수·최신성으로 수요/신선도 보정.
 * 데이터랩은 이 단계에서 다루지 않는다 (collect.ts가 "skipped"로 표시).
 */

export const MAX_QUERIES = 15;
export const DISPLAY = 20;

export { hasNaverKeys };

export function naverItemsToSignal(title: string, items: ParsedFeedItem[], now = Date.now()): RawSignal {
  const latest = items.map((i) => i.publishedAt).filter((v): v is string => !!v).sort().at(-1);
  return {
    source: "naver-news",
    keyword: title,
    evidence: {
      source: "naver-news",
      label: `네이버 뉴스 ${items.length}건`,
      url: `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(title)}`,
      value: String(items.length),
    },
    news: items.slice(0, 5).map((i) => ({ title: i.title, url: i.link, source: "네이버 뉴스", publishedAt: i.publishedAt })),
    demand: clamp01(0.2 + items.length / 25),
    freshness: freshnessFromDate(latest, now),
  };
}

export async function fetchNaverNewsSignals(titles: string[]): Promise<RawSignal[]> {
  if (!hasNaverKeys()) return [];
  const list = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_QUERIES);
  const results = await Promise.allSettled(list.map(async (t) => naverItemsToSignal(t, await searchNaverNews(t, DISPLAY))));
  const ok = results.filter((r): r is PromiseFulfilledResult<RawSignal> => r.status === "fulfilled");
  if (!ok.length && results.length) {
    const first = results[0];
    throw first.status === "rejected" ? first.reason : new Error("네이버 뉴스 검색 실패");
  }
  return ok.map((r) => r.value);
}
