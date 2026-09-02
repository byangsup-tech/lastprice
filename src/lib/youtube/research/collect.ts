import { getCached } from "@/lib/insurance/cache";
import { hasNaverKeys, hasYoutubeDataKey, loadDotenvOnce } from "../config";
import { isTopicUsed, readJsonFile, writeJsonFile } from "../jobs";
import { RESEARCH_LATEST_FILE } from "../paths";
import type {
  ChannelProfile,
  RawSignal,
  ResearchReport,
  ResearchSourceId,
  ResearchSourceState,
  Topic,
  TopicCandidate,
} from "../types";
import { hashId, normalizeKey } from "../util";
import { rerankCandidates } from "./rerank";
import { llmFitOf, mergeCandidates, scoreAll, sourceName } from "./score";
import { fetchGoogleNews } from "./sources/google-news";
import { fetchGoogleTrends } from "./sources/google-trends";
import { fetchNaverNewsSignals } from "./sources/naver";
import { fetchSuggestions, measureYoutubeDemand } from "./sources/suggest";
import { fetchWikipediaMostViewed } from "./sources/wikipedia";
import { fetchChannelRecentTitles, fetchYoutubeStats } from "./sources/youtube-data";

/**
 * 리서치 단계 오케스트레이션.
 *
 * 1) 키 없는 소스(트렌드·뉴스·자동완성·위키) 병렬 수집 → 2) 트렌드 제목 유튜브 수요 확장 + 상위 후보에 대해
 * 유튜브 데이터/네이버(키 있을 때) → 3) 병합·점수화 → 채널 최근 업로드 중복 표시 → LLM 재정렬(가능할 때).
 * 소스 하나가 실패해도 전체는 실패하지 않는다 (ResearchSourceState.error).
 * 결과는 getCached(60분, refresh면 0)로 캐시하고 research-latest.json에 best-effort 저장.
 */

export const RESEARCH_TTL_MS = 60 * 60 * 1000;
/** 소스 하나에 허용하는 총 시간 (개별 fetch는 10s) */
export const SOURCE_DEADLINE_MS = 15_000;
export const DEFAULT_LIMIT = 25;
export const STORED_LIMIT = 50;
export const AUTO_MIN_SCORE = 40;
export const AUTO_MIN_FIT = 0.3;
export const AUTO_MIN_LLM_FIT = 0.5;
const TOP_FOR_KEYED = 15;
const TOP_TRENDS_FOR_EXPANSION = 10;

type Log = (line: string) => void;

export interface ResearchOptions {
  refresh?: boolean;
  limit?: number;
  log?: Log;
}

function state(id: ResearchSourceId, status: ResearchSourceState["status"], count = 0, error?: string): ResearchSourceState {
  return { id, name: sourceName(id), status, count, error, fetchedAt: new Date().toISOString() };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "시간 초과 (10s)";
    return err.message;
  }
  return String(err);
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`시간 초과 (${Math.round(ms / 1000)}s)`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 소스 하나 실행 — 절대 던지지 않고 상태 + 신호를 돌려준다 */
async function runSource(id: ResearchSourceId, fn: () => Promise<RawSignal[]>, log: Log): Promise<{ state: ResearchSourceState; signals: RawSignal[] }> {
  const started = Date.now();
  try {
    const signals = await withDeadline(fn(), SOURCE_DEADLINE_MS);
    log(`${sourceName(id)}: ${signals.length}건 (${Date.now() - started}ms)`);
    return { state: state(id, "live", signals.length), signals };
  } catch (err) {
    const msg = errorMessage(err);
    log(`${sourceName(id)}: 실패 — ${msg}`);
    return { state: state(id, "error", 0, msg), signals: [] };
  }
}

/** YT_CHANNEL_ID + YOUTUBE_API_KEY가 있을 때 채널 최근 업로드 50개 제목 (없거나 실패하면 빈 배열) */
export async function loadChannelUsedTitles(log: Log = () => {}): Promise<string[]> {
  if (!hasYoutubeDataKey() || !process.env.YT_CHANNEL_ID?.trim()) return [];
  try {
    const titles = await withDeadline(fetchChannelRecentTitles(), SOURCE_DEADLINE_MS);
    log(`채널 최근 업로드 ${titles.length}건을 사용된 주제로 취급`);
    return titles;
  } catch (err) {
    log(`채널 업로드 목록 조회 실패 — ${errorMessage(err)}`);
    return [];
  }
}

/** 채널에서 이미 다룬 주제(제목 일치 또는 6자 이상 포함)는 0점 처리 (순수 함수) */
export function applyChannelUsed(candidates: TopicCandidate[], channelTitles: string[]): TopicCandidate[] {
  if (!channelTitles.length) return candidates;
  const used = channelTitles.map(normalizeKey).filter(Boolean);
  return candidates
    .map((c) => {
      const key = normalizeKey(c.title);
      const dup = used.find((u) => u === key || (key.length >= 6 && u.includes(key)));
      if (!dup) return c;
      return { ...c, score: 0, reasons: ["채널 최근 업로드와 중복", ...c.reasons].slice(0, 5) };
    })
    .sort((a, b) => b.score - a.score || b.signals.demand - a.signals.demand);
}

/** 캐시 키 — 프로필의 리서치 관련 필드만 반영 */
export function researchCacheKey(profile: ChannelProfile): string {
  return `youtube:research:${hashId(JSON.stringify({ n: profile.name, k: profile.keywords, a: profile.avoid }))}`;
}

async function collectReport(profile: ChannelProfile, log: Log): Promise<ResearchReport> {
  const keywords = profile.keywords.slice(0, 8);

  // 1) 키 없는 소스 병렬
  const [trends, news, suggestYt, suggestWeb, wiki] = await Promise.all([
    runSource("google-trends", () => fetchGoogleTrends({ limit: 20 }), log),
    runSource("google-news", () => fetchGoogleNews(keywords), log),
    runSource("suggest-yt", () => fetchSuggestions(keywords, "yt"), log),
    runSource("suggest-web", () => fetchSuggestions(keywords, "web"), log),
    runSource("wikipedia", () => fetchWikipediaMostViewed(), log),
  ]);

  // 2) 트렌드 제목의 유튜브 수요 확장 + 키 있는 소스 (상위 후보 기준)
  const phase1 = [...trends.signals, ...news.signals, ...suggestYt.signals, ...suggestWeb.signals, ...wiki.signals];
  const preliminary = scoreAll(mergeCandidates(phase1), profile);
  const topTitles = preliminary.filter((c) => c.score > 0).slice(0, TOP_FOR_KEYED).map((c) => c.title);
  const trendTitles = [...trends.signals]
    .sort((a, b) => (b.demand ?? 0) - (a.demand ?? 0))
    .slice(0, TOP_TRENDS_FOR_EXPANSION)
    .map((s) => s.keyword);

  const [expansion, youtube, naver, channelTitles] = await Promise.all([
    trendTitles.length ? runSource("suggest-yt", () => measureYoutubeDemand(trendTitles), log) : null,
    hasYoutubeDataKey() && topTitles.length ? runSource("youtube-data", () => fetchYoutubeStats(topTitles), log) : null,
    hasNaverKeys() && topTitles.length ? runSource("naver-news", () => fetchNaverNewsSignals(topTitles), log) : null,
    loadChannelUsedTitles(log),
  ]);

  if (expansion) {
    // 확장 결과는 suggest-yt 상태에 합산 (원래 조회가 실패했어도 확장이 성공하면 live)
    if (expansion.state.status === "live") {
      suggestYt.state = {
        ...suggestYt.state,
        status: "live",
        count: suggestYt.state.count + expansion.signals.length,
        error: suggestYt.state.status === "error" ? `키워드 자동완성 실패: ${suggestYt.state.error}` : undefined,
      };
    } else if (suggestYt.state.status === "live") {
      suggestYt.state = { ...suggestYt.state, error: `트렌드 확장 실패: ${expansion.state.error}` };
    }
  }

  // 3) 병합·점수화 → 채널 중복 → LLM 재정렬
  const all = [...phase1, ...(expansion?.signals ?? []), ...(youtube?.signals ?? []), ...(naver?.signals ?? [])];
  let candidates = applyChannelUsed(scoreAll(mergeCandidates(all), profile), channelTitles);
  const rerank = await rerankCandidates(candidates, profile, { log });
  candidates = rerank.candidates.slice(0, STORED_LIMIT);

  const sources: ResearchSourceState[] = [
    trends.state,
    news.state,
    suggestYt.state,
    suggestWeb.state,
    wiki.state,
    youtube?.state ?? state("youtube-data", "no-key"),
    naver?.state ?? state("naver-news", "no-key"),
    state("naver-datalab", "skipped"),
    rerank.status === "on"
      ? state("llm-rerank", "live", rerank.merged)
      : rerank.status === "error"
        ? state("llm-rerank", "error", 0, rerank.error)
        : state("llm-rerank", rerank.status === "off" ? "skipped" : "no-key"),
  ];

  log(`후보 ${candidates.length}개 (점수 ≥ ${AUTO_MIN_SCORE}: ${candidates.filter((c) => c.score >= AUTO_MIN_SCORE).length}개), LLM 재정렬: ${rerank.status}`);
  return {
    generatedAt: new Date().toISOString(),
    profileName: profile.name,
    candidates,
    sources,
    llmRerank: rerank.status,
  };
}

async function saveLatest(report: ResearchReport): Promise<void> {
  try {
    const existing = await readJsonFile<ResearchReport>(RESEARCH_LATEST_FILE);
    if (existing?.generatedAt && existing.generatedAt > report.generatedAt) return;
    await writeJsonFile(RESEARCH_LATEST_FILE, report);
  } catch {
    // best-effort (서버리스 읽기 전용 FS 등)
  }
}

/** 리서치 실행 — 캐시(60분) 또는 refresh 시 강제 재수집. research-latest.json best-effort 저장 */
export async function runResearch(
  profile: ChannelProfile,
  opts: ResearchOptions = {},
): Promise<ResearchReport & { cacheStatus: "live" | "stale" }> {
  loadDotenvOnce();
  const log = opts.log ?? (() => {});
  const limit = Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT));
  const key = researchCacheKey(profile);
  const cached = await getCached(key, () => collectReport(profile, log), opts.refresh ? 0 : RESEARCH_TTL_MS);
  const report = cached.data;
  await saveLatest(report);
  return { ...report, candidates: report.candidates.slice(0, limit), cacheStatus: cached.status };
}

function isReport(raw: unknown): raw is ResearchReport {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Partial<ResearchReport>;
  return typeof r.generatedAt === "string" && Array.isArray(r.candidates) && Array.isArray(r.sources);
}

/** 최근 저장된 리포트 (없거나 손상되면 null) */
export async function loadLatestReport(): Promise<ResearchReport | null> {
  const raw = await readJsonFile<unknown>(RESEARCH_LATEST_FILE);
  return isReport(raw) ? raw : null;
}

/**
 * 자동 주제 선정 — score ≥ 40 AND fit ≥ 0.3 (LLM 재정렬이 켜졌으면 llmFit ≥ 0.5), 사용된 주제 제외.
 * 조건을 만족하는 후보가 없으면 null (호출자는 작업을 만들지 않는다).
 */
export function selectAutoTopic(
  report: ResearchReport,
  used: string[],
  opts: { minScore?: number; minFit?: number } = {},
): TopicCandidate | null {
  const needLlm = report.llmRerank === "on";
  const minScore = opts.minScore ?? AUTO_MIN_SCORE;
  const minFit = opts.minFit ?? (needLlm ? AUTO_MIN_LLM_FIT : AUTO_MIN_FIT);
  const sorted = [...report.candidates].sort((a, b) => b.score - a.score);
  for (const c of sorted) {
    if (c.score < minScore) continue;
    const fit = needLlm ? (llmFitOf(c) ?? 0) : c.signals.fit;
    if (fit < minFit) continue;
    if (isTopicUsed(used, c.title)) continue;
    if (c.suggestedTitle && isTopicUsed(used, c.suggestedTitle)) continue;
    return c;
  }
  return null;
}

/** 후보 → 작업 주제 (LLM 제안 제목이 있으면 그것을 제목으로, 원 키워드는 keywords에 보존) */
export function candidateToTopic(c: TopicCandidate): Topic {
  const title = c.suggestedTitle?.trim() || c.title;
  const keywords = [...new Set([c.title, ...c.keywords].map((k) => k.trim()).filter(Boolean))].slice(0, 10);
  const urls = new Set<string>();
  for (const s of c.sources) if (s.url && !s.url.includes("suggestqueries.google.com")) urls.add(s.url);
  for (const n of c.news) if (n.url) urls.add(n.url);
  return {
    title,
    angle: c.angle,
    keywords,
    sourceUrls: [...urls].slice(0, 12),
    candidateId: c.id,
    news: c.news.slice(0, 12),
  };
}
