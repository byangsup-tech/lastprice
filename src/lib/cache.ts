import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { DEMO_DAYCARES } from "./demo-data";
import { haversineMeters } from "./geo";
import { fetchByArcode } from "./openapi";
import { isWideRegion, legacyCode, REGIONS } from "./regions";
import type { Daycare, DataSource } from "./types";

// Vercel 등 서버리스는 프로젝트 디렉터리가 읽기 전용이므로 /tmp 사용
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "daycare-cache")
  : path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "daycares-by-arcode.json");
const TTL_MS = 24 * 60 * 60 * 1000;

interface ArcodeEntry {
  fetchedAt: number;
  data: Daycare[];
}

interface AreaResult {
  data: Daycare[];
  source: DataSource;
  /** 디버그용: 시군구별 건수/실패 */
  meta: { arcode: string; name: string; count: number; error?: string }[];
}

// 모듈 레벨 싱글턴 — 같은 서버 프로세스(워밍된 람다 포함)에서 공유
const mem = new Map<string, ArcodeEntry>();
const inflight = new Map<string, Promise<ArcodeEntry>>();
let fileLoaded = false;

async function loadFileCacheOnce(): Promise<void> {
  if (fileLoaded) return;
  fileLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, ArcodeEntry>;
    for (const [code, entry] of Object.entries(parsed)) {
      if (entry && Array.isArray(entry.data)) mem.set(code, entry);
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
    console.error("[cache] 파일 캐시 저장 실패:", err);
  }
}

function isFresh(entry: ArcodeEntry | undefined): boolean {
  return !!entry && Date.now() - entry.fetchedAt < TTL_MS;
}

/** arcode 한 건 조회 (신구 코드 폴백 포함). 동시 요청은 한 번만 호출 */
async function fetchArcodeOnce(
  serviceKey: string,
  arcode: string,
): Promise<ArcodeEntry> {
  const existing = inflight.get(arcode);
  if (existing) return existing;

  const task = (async () => {
    let data = await fetchByArcode(serviceKey, arcode);
    if (data.length === 0) {
      const legacy = legacyCode(arcode);
      if (legacy) data = await fetchByArcode(serviceKey, legacy);
    }
    const entry: ArcodeEntry = { fetchedAt: Date.now(), data };
    mem.set(arcode, entry);
    return entry;
  })().finally(() => inflight.delete(arcode));

  inflight.set(arcode, task);
  return task;
}

/** 검색 지점을 커버할 후보 시군구 선택 (중심좌표 + 버퍼 근사) */
export function candidateRegions(lat: number, lng: number, radius: number) {
  return REGIONS.filter((r) => {
    const buffer = isWideRegion(r.code) ? 28000 : 14000;
    return haversineMeters(lat, lng, r.lat, r.lng) <= radius + buffer;
  });
}

/**
 * 검색 위치 주변 시군구 데이터를 모아 반환.
 * 키 없음 → demo / 일부 호출 실패(만료 캐시 사용 포함) → stale / 전부 실패+캐시 없음 → demo
 */
export async function getDaycaresForArea(
  lat: number,
  lng: number,
  radius: number,
): Promise<AreaResult> {
  const serviceKey = process.env.CHILDCARE_API_KEY;
  if (!serviceKey) {
    return {
      data: DEMO_DAYCARES,
      source: "demo",
      meta: [{ arcode: "-", name: "데모", count: DEMO_DAYCARES.length }],
    };
  }

  await loadFileCacheOnce();
  const regions = candidateRegions(lat, lng, radius);
  const meta: AreaResult["meta"] = [];
  let anyFailed = false;
  let dirty = false;

  const CONCURRENCY = 5;
  const results: Daycare[][] = [];
  for (let i = 0; i < regions.length; i += CONCURRENCY) {
    const batch = regions.slice(i, i + CONCURRENCY).map(async (r) => {
      const cached = mem.get(r.code);
      if (cached && isFresh(cached)) {
        meta.push({ arcode: r.code, name: r.name, count: cached.data.length });
        return cached.data;
      }
      try {
        const entry = await fetchArcodeOnce(serviceKey, r.code);
        dirty = true;
        meta.push({ arcode: r.code, name: r.name, count: entry.data.length });
        return entry.data;
      } catch (err) {
        anyFailed = true;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cache] ${r.name}(${r.code}) 수집 실패:`, message);
        meta.push({
          arcode: r.code,
          name: r.name,
          count: cached?.data.length ?? 0,
          error: message,
        });
        // 만료된 캐시라도 있으면 사용
        return cached?.data ?? [];
      }
    });
    results.push(...(await Promise.all(batch)));
  }
  if (dirty) await persistFileCache();

  const seen = new Set<string>();
  const merged: Daycare[] = [];
  for (const list of results) {
    for (const d of list) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      merged.push(d);
    }
  }

  if (merged.length === 0 && anyFailed) {
    // 키는 있는데 데이터를 전혀 못 가져옴 — 빈 화면 대신 데모로 안내
    return { data: DEMO_DAYCARES, source: "demo", meta };
  }
  return { data: merged, source: anyFailed ? "stale" : "live", meta };
}

/** id(stcode)로 단건 조회. 캐시에 없으면 주변 시군구를 불러와 재시도 */
export async function findDaycareById(
  id: string,
  near?: { lat: number; lng: number },
): Promise<{ daycare: Daycare | null; source: DataSource }> {
  const serviceKey = process.env.CHILDCARE_API_KEY;
  if (!serviceKey) {
    return {
      daycare: DEMO_DAYCARES.find((d) => d.id === id) ?? null,
      source: "demo",
    };
  }

  await loadFileCacheOnce();
  for (const entry of mem.values()) {
    const found = entry.data.find((d) => d.id === id);
    if (found) return { daycare: found, source: "live" };
  }
  if (near) {
    const { data, source } = await getDaycaresForArea(near.lat, near.lng, 3000);
    return { daycare: data.find((d) => d.id === id) ?? null, source };
  }
  return { daycare: null, source: "live" };
}
