import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { FeedItem, Lang, TranslationStatus } from "./types";

/**
 * DeepL API로 비한국어 제목을 한국어로 번역한다.
 * - 무료 키(":fx"로 끝남)는 api-free 엔드포인트, 유료 키는 api 엔드포인트
 * - 아이템 id별 결과를 영구 캐시(메모리+파일) — 같은 제목은 한 번만 번역해
 *   무료 한도(월 50만 자)를 아낀다
 * - 번역 실패는 피드를 깨지 않는다 (원문 그대로 + status로 노출)
 *
 * 대상 언어는 TRANSLATE_LANGS(기본 "ja,zh")로 제어. 영어도 번역하려면 "ja,zh,en".
 */

const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), "insurance-cache")
  : path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "insurance-translations.json");
/** 캐시 상한 — 초과 시 오래된 항목부터 제거 */
const MAX_ENTRIES = 3000;
/** DeepL 요청당 최대 텍스트 수 */
const BATCH_SIZE = 50;

export function hasDeepLKey(): boolean {
  return !!process.env.DEEPL_API_KEY;
}

function targetLangs(): Set<Lang> {
  const raw = process.env.TRANSLATE_LANGS ?? "ja,zh";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is Lang => ["ja", "zh", "en"].includes(s)),
  );
}

const mem = new Map<string, string>();
let fileLoaded = false;

async function loadFileCacheOnce(): Promise<void> {
  if (fileLoaded) return;
  fileLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [id, text] of Object.entries(parsed)) {
      if (typeof text === "string") mem.set(id, text);
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
    console.error("[translate] 캐시 저장 실패:", err);
  }
}

function evictOldEntries(): void {
  while (mem.size > MAX_ENTRIES) {
    const oldest = mem.keys().next().value;
    if (oldest == null) break;
    mem.delete(oldest);
  }
}

async function deeplTranslateBatch(texts: string[]): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY!;
  const endpoint = key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
  const body = new URLSearchParams();
  for (const t of texts) body.append("text", t);
  body.set("target_lang", "KO");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DeepL HTTP ${res.status}`);
  const data = (await res.json()) as { translations?: { text: string }[] };
  if (!data.translations || data.translations.length !== texts.length) {
    throw new Error("DeepL 응답 형식 오류");
  }
  return data.translations.map((t) => t.text);
}

/**
 * 대상 언어 아이템의 titleKo를 채운다 (제자리 수정).
 * 데모 아이템은 시드에 수동 번역이 있으므로 건너뛴다.
 */
export async function applyTranslations(
  items: FeedItem[],
): Promise<TranslationStatus> {
  const langs = targetLangs();
  const candidates = items.filter(
    (it) => !it.titleKo && !it.demo && it.lang !== "ko" && langs.has(it.lang),
  );
  if (!hasDeepLKey()) return "no-key";
  if (candidates.length === 0) return "on";

  await loadFileCacheOnce();
  const pending = candidates.filter((it) => {
    const cached = mem.get(it.id);
    if (cached) it.titleKo = cached;
    return !cached;
  });
  if (pending.length === 0) return "on";

  try {
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const translated = await deeplTranslateBatch(batch.map((b) => b.title));
      batch.forEach((it, j) => {
        it.titleKo = translated[j];
        mem.set(it.id, translated[j]);
      });
    }
    evictOldEntries();
    void persistFileCache();
    return "on";
  } catch (err) {
    console.error("[translate] 번역 실패:", err);
    // 일부 배치는 성공했을 수 있음 — 캐시는 저장해 둔다
    void persistFileCache();
    return "error";
  }
}
