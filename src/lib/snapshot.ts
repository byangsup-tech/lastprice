import { promises as fs } from "fs";
import path from "path";
import type { Daycare, HistoryEntry } from "./types";

/**
 * GitHub Actions 크롤러가 저장소에 커밋한 번들 데이터 리더.
 * 배포 단위로 파일이 불변이므로 모듈 레벨로 메모한다.
 */
const DATA_DIR = path.join(process.cwd(), "data");
const FRESH_MS = 48 * 60 * 60 * 1000; // 이보다 오래되면 크롤 중단으로 보고 라이브 폴백

export interface SnapshotMeta {
  crawledAt: string;
  regionCounts?: Record<string, number>;
  errors?: Array<{ code: string; name?: string; error: string }>;
}

const snapshotMemo = new Map<string, Daycare[] | null>();
const historyMemo = new Map<string, Record<string, HistoryEntry[]> | null>();
let metaMemo: SnapshotMeta | null | undefined;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function getSnapshotMeta(): Promise<SnapshotMeta | null> {
  if (metaMemo !== undefined) return metaMemo;
  metaMemo = await readJson<SnapshotMeta>(path.join(DATA_DIR, "meta.json"));
  return metaMemo;
}

export async function isSnapshotFresh(): Promise<boolean> {
  const meta = await getSnapshotMeta();
  if (!meta?.crawledAt) return false;
  const age = Date.now() - new Date(meta.crawledAt).getTime();
  return Number.isFinite(age) && age >= 0 && age < FRESH_MS;
}

export async function loadRegionSnapshot(
  arcode: string,
): Promise<Daycare[] | null> {
  if (snapshotMemo.has(arcode)) return snapshotMemo.get(arcode)!;
  const data = await readJson<Daycare[]>(
    path.join(DATA_DIR, "daycares", `${arcode}.json`),
  );
  const value = Array.isArray(data) ? data : null;
  snapshotMemo.set(arcode, value);
  return value;
}

export async function loadRegionHistory(
  arcode: string,
): Promise<Record<string, HistoryEntry[]> | null> {
  if (historyMemo.has(arcode)) return historyMemo.get(arcode)!;
  const data = await readJson<Record<string, HistoryEntry[]>>(
    path.join(DATA_DIR, "history", `${arcode}.json`),
  );
  const value = data && typeof data === "object" ? data : null;
  historyMemo.set(arcode, value);
  return value;
}
