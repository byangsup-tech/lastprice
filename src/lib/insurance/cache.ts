import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * 소스별 수집 결과 캐시 — 메모리 + 파일(/tmp) 2계층.
 * 수집 실패 시 만료된 캐시(stale)로 폴백한다. (daycare 앱의 cache.ts와 같은 패턴)
 */

const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "insurance-cache")
  : path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "insurance-feeds.json");

/** 뉴스 피드는 15분이면 충분히 신선하다 */
export const FEED_TTL_MS = 15 * 60 * 1000;

interface Entry<T> {
  fetchedAt: number;
  data: T;
}

const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
let fileLoaded = false;

async function loadFileCacheOnce(): Promise<void> {
  if (fileLoaded) return;
  fileLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, Entry<unknown>>;
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && typeof entry.fetchedAt === "number") mem.set(key, entry);
    }
  } catch {
    // 캐시 없음 — 정상
  }
}

async function persistFileCache(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(Object.fromEntries(mem)));
  } catch (err) {
    console.error("[insurance-cache] 파일 캐시 저장 실패:", err);
  }
}

export interface CachedResult<T> {
  data: T;
  status: "live" | "stale";
  fetchedAt: number;
}

/**
 * 캐시가 신선하면 그대로, 아니면 fetcher 실행.
 * fetcher 실패 시 만료된 캐시가 있으면 stale로 반환하고, 없으면 오류를 던진다.
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = FEED_TTL_MS,
): Promise<CachedResult<T>> {
  await loadFileCacheOnce();

  const existing = mem.get(key) as Entry<T> | undefined;
  if (existing && Date.now() - existing.fetchedAt < ttlMs) {
    return { data: existing.data, status: "live", fetchedAt: existing.fetchedAt };
  }

  const running = inflight.get(key) as Promise<CachedResult<T>> | undefined;
  if (running) return running;

  const task: Promise<CachedResult<T>> = (async () => {
    try {
      const data = await fetcher();
      const entry: Entry<T> = { fetchedAt: Date.now(), data };
      mem.set(key, entry);
      void persistFileCache();
      return { data, status: "live" as const, fetchedAt: entry.fetchedAt };
    } catch (err) {
      if (existing) {
        return {
          data: existing.data,
          status: "stale" as const,
          fetchedAt: existing.fetchedAt,
        };
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
