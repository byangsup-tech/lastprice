/**
 * 어린이집정보공개포털 일일 크롤러 (GitHub Actions에서 실행)
 *
 * - data/daycares/<arcode>.json : 시군구별 최신 스냅샷 (결정적 직렬화)
 * - data/history/<arcode>.json  : 어린이집별 정원/현원 변경 이력 (변경 시에만 append)
 * - data/meta.json              : 수집 시각/건수/에러
 *
 * 실행: CHILDCARE_API_KEY=... npx tsx scripts/crawl.ts
 * 옵션: CRAWL_LIMIT=2 (테스트용 지역 수 제한)
 */
import { promises as fs } from "fs";
import path from "path";
import { fetchByArcode } from "../src/lib/openapi";
import { legacyCode, REGIONS } from "../src/lib/regions";
import type { Daycare, HistoryEntry } from "../src/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** KST 기준 YYYY-MM-DD */
function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** 파싱 실패 진단용: 원시 응답 앞부분을 로그 (키가 포함된 URL은 출력하지 않음) */
async function logRawResponse(key: string, arcode: string): Promise<void> {
  try {
    const endpoint =
      process.env.CHILDCARE_API_ENDPOINT ||
      "http://api.childcare.go.kr/mediate/rest/cpmsapi021/cpmsapi021/request";
    const res = await fetch(
      `${endpoint}?key=${encodeURIComponent(key)}&arcode=${arcode}&stcode=`,
      { signal: AbortSignal.timeout(15000) },
    );
    const text = await res.text();
    console.log(
      `[raw] arcode=${arcode} status=${res.status} body(500)=`,
      text.slice(0, 500).replace(new RegExp(key, "g"), "***"),
    );
  } catch (err) {
    console.log(`[raw] arcode=${arcode} 원시 응답 확인 실패:`, err);
  }
}

async function fetchWithFallback(key: string, arcode: string): Promise<Daycare[]> {
  let data = await fetchByArcode(key, arcode);
  if (data.length === 0) {
    const legacy = legacyCode(arcode);
    if (legacy) data = await fetchByArcode(key, legacy);
  }
  return data;
}

async function main() {
  const key = process.env.CHILDCARE_API_KEY;
  if (!key) {
    console.error("CHILDCARE_API_KEY 환경변수가 필요합니다");
    process.exit(1);
  }

  const limit = Number(process.env.CRAWL_LIMIT) || REGIONS.length;
  const regions = REGIONS.slice(0, limit);
  const today = todayKST();

  await fs.mkdir(path.join(DATA_DIR, "daycares"), { recursive: true });
  await fs.mkdir(path.join(DATA_DIR, "history"), { recursive: true });

  const regionCounts: Record<string, number> = {};
  const errors: Array<{ code: string; name: string; error: string }> = [];
  let rawLogged = false;

  for (const region of regions) {
    const snapshotFile = path.join(DATA_DIR, "daycares", `${region.code}.json`);
    try {
      let data: Daycare[];
      try {
        data = await fetchWithFallback(key, region.code);
      } catch {
        await sleep(1000); // 1회 재시도
        data = await fetchWithFallback(key, region.code);
      }

      if (data.length === 0) {
        const prev = await readJson<Daycare[]>(snapshotFile);
        if (prev && prev.length > 0) {
          // 이전엔 데이터가 있었는데 이번에 0건 — 파서/API 문제 의심. 기존 파일 보존.
          console.warn(`[warn] ${region.name}(${region.code}) 0건 — 이전 파일 유지`);
          if (!rawLogged) {
            await logRawResponse(key, region.code);
            rawLogged = true;
          }
          errors.push({ code: region.code, name: region.name, error: "empty_result" });
          continue;
        }
        // 진짜 빈 지역일 수 있음 — 첫 수집이고 진단 로그가 아직 없으면 한 번 남김
        if (!rawLogged) {
          await logRawResponse(key, region.code);
          rawLogged = true;
        }
      }

      // 결정적 직렬화: id 정렬 → 무변경 시 git diff 없음
      data.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      await fs.writeFile(snapshotFile, JSON.stringify(data));
      regionCounts[region.code] = data.length;

      // 이력 병합 (변경 시에만 append, 사라진 id도 이력 보존)
      const historyFile = path.join(DATA_DIR, "history", `${region.code}.json`);
      const history =
        (await readJson<Record<string, HistoryEntry[]>>(historyFile)) ?? {};
      let changed = 0;
      for (const d of data) {
        const entries = history[d.id] ?? (history[d.id] = []);
        const last = entries[entries.length - 1];
        if (!last || last.c !== d.capacity || last.n !== d.current) {
          entries.push({ d: today, c: d.capacity, n: d.current });
          changed++;
        }
      }
      if (changed > 0 || !(await readJson(historyFile))) {
        await fs.writeFile(historyFile, JSON.stringify(history));
      }
      console.log(`[ok] ${region.name}(${region.code}): ${data.length}건, 변경 ${changed}건`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[err] ${region.name}(${region.code}):`, message);
      errors.push({ code: region.code, name: region.name, error: message });
      if (!rawLogged) {
        await logRawResponse(key, region.code);
        rawLogged = true;
      }
    }
    await sleep(DELAY_MS);
  }

  const total = Object.values(regionCounts).reduce((s, n) => s + n, 0);
  await fs.writeFile(
    path.join(DATA_DIR, "meta.json"),
    JSON.stringify(
      { crawledAt: new Date().toISOString(), total, regionCounts, errors },
      null,
      1,
    ),
  );
  console.log(
    `완료: ${regions.length}개 지역, 총 ${total}건, 에러 ${errors.length}건`,
  );

  if (errors.length > regions.length * 0.2) {
    console.error("에러율 20% 초과 — 실패로 표시 (수집된 파일은 유지)");
    process.exitCode = 1;
  }
}

main();
