import { fetchJson } from "@/lib/insurance/http";
import type { RawSignal } from "../../types";
import { countToDemand } from "../score";

/**
 * 한국어 위키백과 일간 최다 조회 문서 (ns 0만, 위키백과:/특수: 제외) — 키 불필요.
 */

export const SOURCE_TIMEOUT_MS = 10_000;
export const WIKI_MOSTVIEWED_URL =
  "https://ko.wikipedia.org/w/api.php?action=query&list=mostviewed&pvimlimit=30&format=json";

interface MostViewedResponse {
  query?: { mostviewed?: { ns?: number; title?: string; count?: number }[] };
}

export interface WikiItem {
  title: string;
  /** "(공무원)" 같은 동음이의 표기를 뗀 제목 */
  cleanTitle: string;
  count: number;
}

export function parseMostViewed(raw: unknown): WikiItem[] {
  const list = (raw as MostViewedResponse)?.query?.mostviewed;
  if (!Array.isArray(list)) return [];
  const out: WikiItem[] = [];
  for (const it of list) {
    if (it.ns !== 0 || typeof it.title !== "string") continue;
    const title = it.title.trim();
    if (!title || /^(위키백과|특수|분류|틀|파일|도움말|사용자|포털):/.test(title)) continue;
    const count = typeof it.count === "number" && Number.isFinite(it.count) ? it.count : 0;
    out.push({ title, cleanTitle: title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title, count });
  }
  return out;
}

export function wikiToSignals(items: WikiItem[]): RawSignal[] {
  return items.map((it) => ({
    source: "wikipedia",
    keyword: it.cleanTitle,
    evidence: {
      source: "wikipedia",
      label: `최다 조회 문서 '${it.title}' ${it.count.toLocaleString("ko-KR")}회`,
      url: `https://ko.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/ /g, "_"))}`,
      value: String(it.count),
    },
    demand: countToDemand(it.count),
    // 일간 조회 통계 — 어제 기준이라 중간 신선도
    freshness: 0.6,
  }));
}

export async function fetchWikipediaMostViewed(): Promise<RawSignal[]> {
  const raw = await fetchJson<unknown>(WIKI_MOSTVIEWED_URL, {}, SOURCE_TIMEOUT_MS);
  return wikiToSignals(parseMostViewed(raw));
}
