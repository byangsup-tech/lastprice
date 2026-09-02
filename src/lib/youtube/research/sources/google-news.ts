import { fetchText } from "@/lib/insurance/http";
import { parseFeed } from "@/lib/insurance/rss";
import type { CandidateNews, RawSignal } from "../../types";
import {
  clusterHeadlines,
  clusterSizeToDemand,
  clusterTitle,
  freshnessFromDate,
  splitPublisher,
  type HeadlineItem,
} from "../score";

/**
 * 구글 뉴스 RSS 검색 — 프로필 키워드(≤8)마다 검색해 제목을 클러스터링, 상위 클러스터를 후보로.
 * URL: https://news.google.com/rss/search?q=<kw>&hl=ko&gl=KR&ceid=KR:ko
 */

export const SOURCE_TIMEOUT_MS = 10_000;
export const MAX_KEYWORDS = 8;
export const CLUSTERS_PER_KEYWORD = 4;

export function googleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
}

/** RSS XML → 헤드라인 항목 ("제목 - 매체" 분리) */
export function parseNewsFeed(xml: string): HeadlineItem[] {
  return parseFeed(xml).map((it) => {
    const { title, source } = splitPublisher(it.title);
    return { title, url: it.link, source, publishedAt: it.publishedAt };
  });
}

/** 한 키워드의 헤드라인 → 클러스터 → 원시 신호 */
export function newsToSignals(keyword: string, items: HeadlineItem[], now = Date.now()): RawSignal[] {
  const clusters = clusterHeadlines(items, { query: keyword }).slice(0, CLUSTERS_PER_KEYWORD);
  return clusters.map((cl) => {
    const title = clusterTitle(cl, keyword);
    const news: CandidateNews[] = cl.items.slice(0, 8).map((n) => ({
      title: n.title,
      url: n.url,
      source: n.source,
      publishedAt: n.publishedAt,
    }));
    return {
      source: "google-news",
      keyword: title,
      evidence: {
        source: "google-news",
        label: `'${keyword}' 검색 헤드라인 ${cl.items.length}건`,
        url: googleNewsUrl(keyword),
        value: String(cl.items.length),
      },
      news,
      demand: clusterSizeToDemand(cl.items.length),
      freshness: freshnessFromDate(cl.latestAt, now),
    };
  });
}

export async function fetchGoogleNews(keywords: string[]): Promise<RawSignal[]> {
  const kws = keywords.map((k) => k.trim()).filter(Boolean).slice(0, MAX_KEYWORDS);
  const results = await Promise.allSettled(
    kws.map(async (kw) => {
      const xml = await fetchText(googleNewsUrl(kw), {}, SOURCE_TIMEOUT_MS);
      return newsToSignals(kw, parseNewsFeed(xml));
    }),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === "fulfilled");
  if (!ok.length && results.length) {
    const first = results[0];
    throw first.status === "rejected" ? first.reason : new Error("구글 뉴스 검색 실패");
  }
  return ok.flatMap((r) => r.value);
}
