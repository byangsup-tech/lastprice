import { fetchText } from "@/lib/insurance/http";
import { decodeEntities, stripCdata, stripTags } from "@/lib/insurance/rss";
import type { CandidateNews, RawSignal } from "../../types";
import { freshnessFromDate, trafficToDemand } from "../score";

/**
 * 구글 트렌드 일간 급상승 RSS (geo=KR) — 키 불필요.
 * 항목: <title>, <ht:approx_traffic>, <pubDate>, 반복 <ht:news_item>{title,url,source,snippet}.
 * ht: 네임스페이스는 rss.ts의 parseFeed가 다루지 않으므로 여기서 정규식으로 파싱한다.
 */

export const TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=KR";
export const SOURCE_TIMEOUT_MS = 10_000;

export interface TrendItem {
  title: string;
  /** "200+", "1000+" 같은 원문 */
  traffic?: string;
  publishedAt?: string;
  picture?: string;
  news: CandidateNews[];
}

function tag(block: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = block.match(re);
  if (!m) return undefined;
  const text = decodeEntities(stripTags(stripCdata(m[1]))).trim();
  return text || undefined;
}

function toIso(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = Date.parse(text);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** 트렌드 RSS XML → 항목 목록 (잘못된 항목은 건너뜀) */
export function parseTrendsRss(xml: string): TrendItem[] {
  const items: TrendItem[] = [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = tag(block, "title");
    if (!title) continue;
    const publishedAt = toIso(tag(block, "pubDate"));
    const news: CandidateNews[] = [];
    for (const nb of block.match(/<ht:news_item(?:\s[^>]*)?>[\s\S]*?<\/ht:news_item>/gi) ?? []) {
      const nt = tag(nb, "ht:news_item_title");
      const url = tag(nb, "ht:news_item_url");
      if (!nt || !url || !/^https?:\/\//.test(url)) continue;
      news.push({ title: nt, url, source: tag(nb, "ht:news_item_source"), publishedAt });
    }
    items.push({
      title,
      traffic: tag(block, "ht:approx_traffic"),
      publishedAt,
      picture: tag(block, "ht:picture"),
      news,
    });
  }
  return items;
}

/** 트렌드 항목 → 원시 신호 */
export function trendsToSignals(items: TrendItem[], now = Date.now()): RawSignal[] {
  return items.map((it) => ({
    source: "google-trends",
    keyword: it.title,
    evidence: {
      source: "google-trends",
      label: `급상승 검색어 ${it.traffic ?? ""}`.trim(),
      url: TRENDS_RSS_URL,
      value: it.traffic,
    },
    news: it.news,
    demand: trafficToDemand(it.traffic),
    freshness: freshnessFromDate(it.publishedAt, now),
  }));
}

export async function fetchGoogleTrends(opts: { limit?: number } = {}): Promise<RawSignal[]> {
  const xml = await fetchText(TRENDS_RSS_URL, {}, SOURCE_TIMEOUT_MS);
  const items = parseTrendsRss(xml).slice(0, opts.limit ?? 20);
  return trendsToSignals(items);
}
