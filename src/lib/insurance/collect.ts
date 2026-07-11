import { fetchInsuranceBills, hasAssemblyKey } from "./assembly";
import { getCached } from "./cache";
import { productTags } from "./classify";
import { fetchDartInsurerFilings, hasDartKey } from "./dart";
import { demoItems } from "./demo-data";
import { hasNaverKeys, searchNaverNews } from "./naver";
import { fetchText } from "./http";
import { parseFeed, type ParsedFeedItem } from "./rss";
import { SCRAPERS, scrapeBoard } from "./scrapers";
import { applyTranslations } from "./translate";
import { SOURCES } from "./sources";
import {
  CATEGORIES,
  type FeedItem,
  type FeedResponse,
  type SourceDef,
  type SourceState,
} from "./types";

const DEFAULT_LIMIT = 20;

/** URL 기반 짧은 해시 (djb2) — 피드 아이템 id/중복 제거용 */
function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** utm 등 추적 파라미터를 떼어 중복 판정을 안정화 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    [...u.searchParams.keys()]
      .filter((k) => k.startsWith("utm_") || k === "fbclid")
      .forEach((k) => u.searchParams.delete(k));
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}

function passesInclude(def: SourceDef, item: ParsedFeedItem): boolean {
  if (!def.include?.length) return true;
  const haystack = `${item.title} ${item.summary ?? ""}`.toLowerCase();
  return def.include.some((kw) => haystack.includes(kw.toLowerCase()));
}

function toFeedItems(
  def: SourceDef,
  parsed: ParsedFeedItem[],
  fallbackTime: number,
): FeedItem[] {
  return parsed
    .filter((p) => passesInclude(def, p))
    .slice(0, def.limit ?? DEFAULT_LIMIT)
    .map((p) => {
      const url = normalizeUrl(p.link);
      const summary = def.noSummary ? undefined : p.summary;
      return {
        id: hashId(url),
        sourceId: def.id,
        sourceName: def.name,
        category: def.category,
        title: p.title,
        url,
        summary,
        publishedAt: p.publishedAt ?? new Date(fallbackTime).toISOString(),
        lang: def.lang,
        market: def.market,
        tags:
          def.category === "new-products"
            ? productTags(`${p.title} ${summary ?? ""}`)
            : undefined,
      };
    });
}

async function fetchSource(def: SourceDef): Promise<ParsedFeedItem[]> {
  switch (def.kind) {
    case "rss":
      return parseFeed(await fetchText(def.url!));
    case "naver-news":
      return searchNaverNews(def.query!, def.limit ?? DEFAULT_LIMIT);
    case "dart":
      return fetchDartInsurerFilings();
    case "scrape": {
      const config = SCRAPERS[def.id];
      if (!config) throw new Error(`스크레이퍼 설정 없음: ${def.id}`);
      return scrapeBoard(config);
    }
    case "assembly":
      return fetchInsuranceBills();
  }
}

async function collectSource(
  def: SourceDef,
): Promise<{ items: FeedItem[]; state: SourceState }> {
  const base = { id: def.id, name: def.name, category: def.category };

  if (def.kind === "naver-news" && !hasNaverKeys()) {
    return { items: [], state: { ...base, status: "no-key", count: 0 } };
  }
  if (def.kind === "dart" && !hasDartKey()) {
    return { items: [], state: { ...base, status: "no-key", count: 0 } };
  }
  if (def.kind === "assembly" && !hasAssemblyKey()) {
    return { items: [], state: { ...base, status: "no-key", count: 0 } };
  }

  try {
    const { data, status, fetchedAt } = await getCached(def.id, () =>
      fetchSource(def),
    );
    const items = toFeedItems(def, data, fetchedAt);
    return {
      items,
      state: {
        ...base,
        status,
        count: items.length,
        fetchedAt: new Date(fetchedAt).toISOString(),
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], state: { ...base, status: "error", count: 0, error: message } };
  }
}

/** 모든 소스를 병렬 수집하고, 소스가 전멸한 카테고리는 데모 데이터로 채운다 */
export async function collectFeeds(): Promise<FeedResponse> {
  const results = await Promise.all(SOURCES.map(collectSource));

  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    for (const item of r.items) {
      const key = `${item.id}|${item.title}`;
      if (seen.has(key) || seen.has(item.id)) continue;
      seen.add(item.id);
      seen.add(key);
      items.push(item);
    }
  }

  const states = results.map((r) => r.state);

  // 카테고리별 데모 폴백
  for (const category of CATEGORIES) {
    const hasReal = items.some((it) => it.category === category);
    if (!hasReal) {
      const demo = demoItems(category);
      items.push(...demo);
      states.push({
        id: `demo-${category}`,
        name: "예시 데이터",
        category,
        status: "demo",
        count: demo.length,
      });
    }
  }

  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const translation = await applyTranslations(items);

  return {
    items,
    sources: states,
    translation,
    generatedAt: new Date().toISOString(),
  };
}
