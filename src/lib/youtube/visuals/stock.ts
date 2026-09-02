import { promises as fs } from "fs";
import path from "path";
import { fetchJson } from "@/lib/insurance/http";
import { hasPexelsKey } from "../config";
import { readJsonFile, writeJsonFile } from "../jobs";
import { STOCK_CACHE_DIR } from "../paths";
import type { Scene } from "../types";
import { hashId } from "../util";

/**
 * Pexels 스톡 사진·영상 (addendum §E)
 * - 사진: /v1/search?per_page=5&orientation=landscape&size=large → src.original + ?auto=compress&cs=tinysrgb&w=2560
 * - 영상: /videos/search?per_page=5&orientation=landscape&size=medium → mp4 & 1920 ≤ width ≤ 2560, 폭 오름차순 첫 항목
 * - 캐시: 검색 JSON .cache/youtube/stock/search/<hash>.json (7일), 파일 .cache/youtube/stock/{photos,videos}/<id>.<ext>
 * - 실패는 예외로 던지지 않고 null (장면별 카드 폴백은 render.ts 책임)
 * - fetch/다운로드는 주입 가능 (단위 테스트)
 */

export const PEXELS_PHOTO_SEARCH = "https://api.pexels.com/v1/search";
export const PEXELS_VIDEO_SEARCH = "https://api.pexels.com/videos/search";
export const SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_PAGE = 5;

// ── Pexels 응답 형태 (필요한 필드만) ─────────────────────────

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url?: string;
  src: {
    original: string;
    large2x?: string;
    large?: string;
    landscape?: string;
  };
}

export interface PexelsPhotoSearch {
  page?: number;
  per_page?: number;
  total_results?: number;
  photos: PexelsPhoto[];
}

export interface PexelsVideoFile {
  id: number;
  quality: string | null;
  file_type: string;
  width: number | null;
  height: number | null;
  fps?: number | null;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  url: string;
  duration?: number;
  user: { id?: number; name: string; url?: string };
  video_files: PexelsVideoFile[];
}

export interface PexelsVideoSearch {
  page?: number;
  per_page?: number;
  total_results?: number;
  videos: PexelsVideo[];
}

export interface StockCredit {
  by: string;
  url: string;
}

export interface StockPick {
  /** 캐시된 로컬 파일 절대 경로 */
  path: string;
  credit: StockCredit;
}

/** 테스트 주입용 의존성 */
export interface StockDeps {
  apiKey?: string;
  cacheDir?: string;
  fetchJson?: <T>(url: string, init?: RequestInit) => Promise<T>;
  download?: (url: string, dest: string, headers: Record<string, string>) => Promise<void>;
  now?: () => number;
}

interface SearchCacheEntry<T> {
  fetchedAt: number;
  kind: "photo" | "video";
  query: string;
  data: T;
}

export function hasStock(): boolean {
  return hasPexelsKey();
}

/** 장면 검색어 — visualKeywords 공백 결합 (비어 있으면 null) */
export function stockQuery(scene: Pick<Scene, "visualKeywords">): string | null {
  const q = (scene.visualKeywords ?? [])
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return q || null;
}

// ── 선택 규칙 (순수 함수) ────────────────────────────────────

/** 가로형·충분히 큰 사진만 (w ≥ 1920, 가로 > 세로), 원본 순서 유지 */
export function photoCandidates(res: PexelsPhotoSearch): PexelsPhoto[] {
  return (res.photos ?? []).filter(
    (p) => p && typeof p.src?.original === "string" && p.width >= 1920 && p.width > p.height,
  );
}

/** 다운로드 URL — 원본에 Pexels 리사이즈 파라미터 (2304 이상 확보) */
export function photoDownloadUrl(photo: PexelsPhoto): string {
  const base = photo.src.original.split("?")[0];
  return `${base}?auto=compress&cs=tinysrgb&w=2560`;
}

/** mp4 & 1920 ≤ width ≤ 2560 중 폭 오름차순 첫 항목 (quality 무시) */
export function pickVideoFile(video: PexelsVideo): PexelsVideoFile | null {
  const files = (video.video_files ?? []).filter(
    (f) =>
      f &&
      f.file_type === "video/mp4" &&
      typeof f.width === "number" &&
      f.width >= 1920 &&
      f.width <= 2560 &&
      typeof f.link === "string",
  );
  files.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return files[0] ?? null;
}

export function videoCandidates(res: PexelsVideoSearch): Array<{ video: PexelsVideo; file: PexelsVideoFile }> {
  const out: Array<{ video: PexelsVideo; file: PexelsVideoFile }> = [];
  for (const v of res.videos ?? []) {
    const file = v ? pickVideoFile(v) : null;
    if (file) out.push({ video: v, file });
  }
  return out;
}

/** 같은 검색어를 쓰는 장면들이 서로 다른 후보를 받도록 index 로 순환 선택 */
export function pickByIndex<T>(candidates: T[], index: number): T | null {
  if (!candidates.length) return null;
  const i = ((Math.floor(index) % candidates.length) + candidates.length) % candidates.length;
  return candidates[i];
}

export function photoCredit(photo: PexelsPhoto): StockCredit {
  return { by: photo.photographer || "Pexels", url: photo.url };
}

export function videoCredit(video: PexelsVideo): StockCredit {
  return { by: video.user?.name || "Pexels", url: video.url };
}

export function searchCacheFile(kind: "photo" | "video", query: string, cacheDir = STOCK_CACHE_DIR): string {
  return path.join(cacheDir, "search", `${kind}-${hashId(`${kind}:${query}`)}.json`);
}

// ── 네트워크·캐시 ────────────────────────────────────────────

async function defaultDownload(url: string, dest: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(120_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000) throw new Error(`다운로드 파일이 비정상적으로 작음 (${buf.length} bytes)`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part-${process.pid}`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, dest);
}

function resolveDeps(deps: StockDeps) {
  const apiKey = deps.apiKey ?? process.env.PEXELS_API_KEY?.trim();
  return {
    apiKey,
    cacheDir: deps.cacheDir ?? STOCK_CACHE_DIR,
    fetchJson: deps.fetchJson ?? (<T>(url: string, init?: RequestInit) => fetchJson<T>(url, init, 15_000)),
    download: deps.download ?? defaultDownload,
    now: deps.now ?? (() => Date.now()),
  };
}

async function cachedSearch<T>(
  kind: "photo" | "video",
  query: string,
  url: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<T> {
  const file = searchCacheFile(kind, query, deps.cacheDir);
  const cached = await readJsonFile<SearchCacheEntry<T>>(file);
  if (cached && cached.data && deps.now() - cached.fetchedAt < SEARCH_TTL_MS) return cached.data;
  if (!deps.apiKey) throw new Error("PEXELS_API_KEY 없음");
  const data = await deps.fetchJson<T>(url, { headers: { authorization: deps.apiKey } });
  const entry: SearchCacheEntry<T> = { fetchedAt: deps.now(), kind, query, data };
  await writeJsonFile(file, entry).catch(() => undefined);
  return data;
}

async function fileOk(file: string): Promise<boolean> {
  try {
    const st = await fs.stat(file);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function searchUrl(base: string, query: string, extra: Record<string, string>): string {
  const u = new URL(base);
  u.searchParams.set("query", query);
  u.searchParams.set("per_page", String(PER_PAGE));
  u.searchParams.set("orientation", "landscape");
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.toString();
}

/** 사진 검색 + 다운로드 (캐시). 실패 시 예외 */
export async function fetchPhoto(query: string, index: number, deps: StockDeps = {}): Promise<StockPick | null> {
  const d = resolveDeps(deps);
  const res = await cachedSearch<PexelsPhotoSearch>("photo", query, searchUrl(PEXELS_PHOTO_SEARCH, query, { size: "large" }), d);
  const photo = pickByIndex(photoCandidates(res), index);
  if (!photo) return null;
  const dest = path.join(d.cacheDir, "photos", `${photo.id}.jpg`);
  if (!(await fileOk(dest))) await d.download(photoDownloadUrl(photo), dest, {});
  return { path: dest, credit: photoCredit(photo) };
}

/** 영상 검색 + 다운로드 (캐시). 실패 시 예외 */
export async function fetchVideo(query: string, index: number, deps: StockDeps = {}): Promise<StockPick | null> {
  const d = resolveDeps(deps);
  const res = await cachedSearch<PexelsVideoSearch>("video", query, searchUrl(PEXELS_VIDEO_SEARCH, query, { size: "medium" }), d);
  const pick = pickByIndex(videoCandidates(res), index);
  if (!pick) return null;
  const dest = path.join(d.cacheDir, "videos", `${pick.video.id}.mp4`);
  if (!(await fileOk(dest))) await d.download(pick.file.link, dest, {});
  return { path: dest, credit: videoCredit(pick.video) };
}

/**
 * 장면에 맞는 스톡 파일 하나 — 검색어는 visualKeywords, 후보는 장면 index 로 순환.
 * 키가 없거나 검색·다운로드가 실패하면 null (호출자가 카드로 폴백).
 */
export async function pickStockForScene(
  scene: Scene,
  kind: "photo" | "video",
  deps: StockDeps = {},
): Promise<{ path: string; credit: { by: string; url: string } } | null> {
  const query = stockQuery(scene);
  if (!query) return null;
  const d = resolveDeps(deps);
  if (!d.apiKey) return null;
  try {
    return kind === "photo" ? await fetchPhoto(query, scene.index, deps) : await fetchVideo(query, scene.index, deps);
  } catch {
    return null;
  }
}
