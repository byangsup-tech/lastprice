import { fetchJson } from "@/lib/insurance/http";
import { hasYoutubeDataKey } from "../../config";
import type { RawSignal } from "../../types";
import { clamp01 } from "../../util";

/**
 * YouTube Data API v3 (YOUTUBE_API_KEY 필요) — 상위 후보 15개까지 search.list(100 units) + videos.list.
 * competition = 1 − clamp(log10(중앙값 조회수)/6) 을 결과 수와 블렌드, demand 보정 = clamp(log10(총 조회수)/7).
 */

export const SOURCE_TIMEOUT_MS = 10_000;
export const MAX_QUERIES = 15;
const API = "https://www.googleapis.com/youtube/v3";

export { hasYoutubeDataKey };

interface SearchResponse {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; publishedAt?: string } }[];
}
interface VideosResponse {
  items?: { id?: string; statistics?: { viewCount?: string } }[];
}

export function parseSearchIds(raw: unknown): string[] {
  const items = (raw as SearchResponse)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => it.id?.videoId).filter((v): v is string => typeof v === "string" && v.length > 0);
}

export function parseViewCounts(raw: unknown): number[] {
  const items = (raw as VideosResponse)?.items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => Number(it.statistics?.viewCount))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export interface CompetitionEstimate {
  competition: number;
  demandBoost: number;
  medianViews: number;
  sumViews: number;
  count: number;
}

export function estimateCompetition(views: number[]): CompetitionEstimate {
  const count = views.length;
  if (!count) return { competition: 0.9, demandBoost: 0.1, medianViews: 0, sumViews: 0, count: 0 };
  const sorted = [...views].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const medianViews = count % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const sumViews = views.reduce((a, b) => a + b, 0);
  const byViews = 1 - clamp01(Math.log10(Math.max(1, medianViews)) / 6);
  const byCount = 1 - clamp01(count / 10);
  return {
    competition: clamp01(0.7 * byViews + 0.3 * byCount),
    demandBoost: clamp01(Math.log10(Math.max(1, sumViews)) / 7),
    medianViews,
    sumViews,
    count,
  };
}

function searchUrl(q: string): string {
  const publishedAfter = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  return (
    `${API}/search?part=snippet&type=video&regionCode=KR&relevanceLanguage=ko&order=viewCount` +
    `&publishedAfter=${encodeURIComponent(publishedAfter)}&maxResults=10&q=${encodeURIComponent(q)}`
  );
}

function videosUrl(ids: string[]): string {
  return `${API}/videos?part=statistics,contentDetails&id=${encodeURIComponent(ids.join(","))}`;
}

/** 후보 제목별 경쟁도·수요 측정 (키 없으면 빈 배열) */
export async function fetchYoutubeStats(titles: string[]): Promise<RawSignal[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) return [];
  const list = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, MAX_QUERIES);
  const results = await Promise.allSettled(
    list.map(async (title): Promise<RawSignal> => {
      const ids = parseSearchIds(await fetchJson<unknown>(searchUrl(title), { headers: { "x-goog-api-key": key } }, SOURCE_TIMEOUT_MS));
      const views = ids.length ? parseViewCounts(await fetchJson<unknown>(videosUrl(ids), { headers: { "x-goog-api-key": key } }, SOURCE_TIMEOUT_MS)) : [];
      const est = estimateCompetition(views);
      return {
        source: "youtube-data",
        keyword: title,
        evidence: {
          source: "youtube-data",
          label: `최근 30일 상위 영상 ${est.count}개, 중앙값 ${Math.round(est.medianViews).toLocaleString("ko-KR")}회`,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
          value: `${est.count}개/${Math.round(est.medianViews)}회`,
        },
        competition: est.competition,
        demand: est.demandBoost,
      };
    }),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<RawSignal> => r.status === "fulfilled");
  if (!ok.length && results.length) {
    const first = results[0];
    throw first.status === "rejected" ? first.reason : new Error("YouTube Data API 실패");
  }
  return ok.map((r) => r.value);
}

// ── 채널 최근 업로드 제목 (YT_CHANNEL_ID) ────────────────────

interface ChannelSearchResponse {
  items?: { snippet?: { title?: string } }[];
}

export function parseChannelTitles(raw: unknown): string[] {
  const items = (raw as ChannelSearchResponse)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it) => it.snippet?.title?.trim()).filter((t): t is string => !!t);
}

/** 채널 최근 업로드 50개 제목 (키·채널 ID 없으면 빈 배열, 실패 시 예외) */
export async function fetchChannelRecentTitles(): Promise<string[]> {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  const channelId = process.env.YT_CHANNEL_ID?.trim();
  if (!key || !channelId) return [];
  const url =
    `${API}/search?part=snippet&type=video&order=date&maxResults=50` +
    `&channelId=${encodeURIComponent(channelId)}`;
  // API 키는 URL이 아니라 헤더로 — 오류 메시지·로그·리포트에 키가 남지 않게
  return parseChannelTitles(await fetchJson<unknown>(url, { headers: { "x-goog-api-key": key } }, SOURCE_TIMEOUT_MS));
}
