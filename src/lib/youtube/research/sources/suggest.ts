import { fetchJson } from "@/lib/insurance/http";
import type { RawSignal, ResearchSourceId } from "../../types";
import { clamp01, normalizeKey } from "../../util";

/**
 * 구글/유튜브 자동완성 (suggestqueries, client=firefox) — 키 불필요.
 * - 프로필 키워드마다 제안어 → 후보 (수요 = 0.35 + 0.05 × 아래에서 센 순위)
 * - 트렌드 제목 확장: 유튜브 제안어 중 해당 용어를 포함하는 개수 / 10 → 유튜브 수요 측정 (호출 ≤ 10회)
 */

export const SOURCE_TIMEOUT_MS = 10_000;
export const MAX_KEYWORDS = 8;
export const MAX_EXPANSIONS = 10;
const CONCURRENCY = 4;

export type SuggestKind = "yt" | "web";

export function suggestUrl(query: string, kind: SuggestKind): string {
  const ds = kind === "yt" ? "&ds=yt" : "";
  return `https://suggestqueries.google.com/complete/search?client=firefox${ds}&hl=ko&gl=kr&q=${encodeURIComponent(query)}`;
}

/** firefox 형식 응답 [q, [제안…], [], {…}] → 제안 문자열 (검색어 자체는 제외) */
export function parseSuggest(raw: unknown, query?: string): string[] {
  if (!Array.isArray(raw) || !Array.isArray(raw[1])) return [];
  const q = query ? normalizeKey(query) : "";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw[1] as unknown[]) {
    if (typeof s !== "string") continue;
    const t = s.trim();
    const k = normalizeKey(t);
    if (!k || k === q || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function suggestionsToSignals(keyword: string, suggestions: string[], kind: SuggestKind): RawSignal[] {
  const source: ResearchSourceId = kind === "yt" ? "suggest-yt" : "suggest-web";
  const n = suggestions.length;
  return suggestions.map((s, i) => ({
    source,
    keyword: s,
    evidence: {
      source,
      label: `'${keyword}' 자동완성 ${i + 1}위`,
      url: suggestUrl(keyword, kind),
      value: `${i + 1}/${n}`,
    },
    demand: clamp01(0.35 + 0.05 * (n - 1 - i)),
  }));
}

/** 유튜브 제안어 중 용어를 포함하는 개수 / 10 */
export function ytDemandFromSuggestions(term: string, suggestions: string[]): number {
  const k = normalizeKey(term);
  if (!k) return 0;
  const hits = suggestions.filter((s) => normalizeKey(s).includes(k)).length;
  return clamp01(hits / 10);
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchOne(query: string, kind: SuggestKind): Promise<string[]> {
  const raw = await fetchJson<unknown>(suggestUrl(query, kind), {}, SOURCE_TIMEOUT_MS);
  // 응답 배열의 첫 요소가 echo된 검색어이므로 raw[1]만 사용, 검색어 자체는 제외
  return parseSuggest(raw, query);
}

/** 프로필 키워드 자동완성 → 후보 신호 */
export async function fetchSuggestions(keywords: string[], kind: SuggestKind): Promise<RawSignal[]> {
  const kws = keywords.map((k) => k.trim()).filter(Boolean).slice(0, MAX_KEYWORDS);
  const results = await mapLimited(kws, CONCURRENCY, async (kw) => suggestionsToSignals(kw, await fetchOne(kw, kind), kind));
  const ok = results.filter((r): r is PromiseFulfilledResult<RawSignal[]> => r.status === "fulfilled");
  if (!ok.length && results.length) {
    const first = results[0];
    throw first.status === "rejected" ? first.reason : new Error("자동완성 조회 실패");
  }
  return ok.flatMap((r) => r.value);
}

/** 트렌드 제목 등 용어의 유튜브 수요 측정 (≤ 10회 호출) — 실패한 용어는 건너뜀 */
export async function measureYoutubeDemand(terms: string[]): Promise<RawSignal[]> {
  const list = [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_EXPANSIONS);
  const results = await mapLimited(list, CONCURRENCY, async (term) => {
    const raw = await fetchJson<unknown>(suggestUrl(term, "yt"), {}, SOURCE_TIMEOUT_MS);
    const suggestions = Array.isArray(raw) && Array.isArray(raw[1]) ? (raw[1] as unknown[]).filter((s): s is string => typeof s === "string") : [];
    const demand = ytDemandFromSuggestions(term, suggestions);
    const hits = Math.round(demand * 10);
    const sig: RawSignal = {
      source: "suggest-yt",
      keyword: term,
      evidence: {
        source: "suggest-yt",
        label: `유튜브 자동완성 ${hits}건 포함`,
        url: suggestUrl(term, "yt"),
        value: `${hits}/10`,
      },
      demand,
    };
    return sig;
  });
  return results.filter((r): r is PromiseFulfilledResult<RawSignal> => r.status === "fulfilled").map((r) => r.value);
}
