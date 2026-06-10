import { promises as fs } from "fs";
import path from "path";
import { DEMO_DAYCARES } from "./demo-data";
import { fetchAllDaycares } from "./openapi";
import type { Daycare, DataSource } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "daycares.json");
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheFile {
  fetchedAt: number;
  data: Daycare[];
}

interface MemoryCache {
  data: Daycare[] | null;
  fetchedAt: number;
  inflight: Promise<{ data: Daycare[]; source: DataSource }> | null;
}

// 모듈 레벨 싱글턴 — dev/start 서버 프로세스 내에서 요청 간 공유
const mem: MemoryCache = { data: null, fetchedAt: 0, inflight: null };

async function readFileCache(): Promise<CacheFile | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeFileCache(data: Daycare[]): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const payload: CacheFile = { fetchedAt: Date.now(), data };
    await fs.writeFile(CACHE_FILE, JSON.stringify(payload));
  } catch (err) {
    console.error("[cache] 파일 캐시 저장 실패:", err);
  }
}

async function loadLive(
  serviceKey: string,
): Promise<{ data: Daycare[]; source: DataSource }> {
  // 1. 신선한 파일 캐시
  const fileCache = await readFileCache();
  if (fileCache && Date.now() - fileCache.fetchedAt < TTL_MS) {
    mem.data = fileCache.data;
    mem.fetchedAt = fileCache.fetchedAt;
    return { data: fileCache.data, source: "live" };
  }

  // 2. 오픈 API에서 새로 수집
  try {
    const data = await fetchAllDaycares(serviceKey);
    mem.data = data;
    mem.fetchedAt = Date.now();
    await writeFileCache(data);
    return { data, source: "live" };
  } catch (err) {
    console.error("[cache] 오픈 API 수집 실패:", err);
    // 3. 만료된 파일 캐시라도 있으면 사용
    if (fileCache) {
      mem.data = fileCache.data;
      mem.fetchedAt = fileCache.fetchedAt;
      return { data: fileCache.data, source: "stale" };
    }
    // 4. 최후 수단: 데모 데이터 (앱이 빈 화면이 되지 않도록)
    return { data: DEMO_DAYCARES, source: "demo" };
  }
}

export async function getDaycares(): Promise<{
  data: Daycare[];
  source: DataSource;
}> {
  const serviceKey = process.env.DATA_GO_KR_API_KEY;
  if (!serviceKey) return { data: DEMO_DAYCARES, source: "demo" };

  if (mem.data && Date.now() - mem.fetchedAt < TTL_MS) {
    return { data: mem.data, source: "live" };
  }

  // 동시 콜드스타트 요청은 한 번의 수집을 공유
  if (!mem.inflight) {
    mem.inflight = loadLive(serviceKey).finally(() => {
      mem.inflight = null;
    });
  }
  return mem.inflight;
}
