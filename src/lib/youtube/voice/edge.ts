import { promises as fs } from "fs";
import path from "path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import type { WordTiming } from "../types";
import { ticksToMs } from "./align";
import { TtsError, type SceneSynthesizer, type SynthesisRequest, type SynthesisResult } from "./tts";

/**
 * Microsoft Edge TTS (msedge-tts) 공급자 — 키 불필요, 기본 공급자.
 *
 * - toFile(dir, text, {rate})는 dir 안에 고정 이름 audio.mp3 / metadata.json 을 쓴다
 *   → 장면마다 임시 디렉터리(workDir)에 받고 outFile로 rename
 * - metadata.json: { "Metadata": [ { "Type":"WordBoundary", "Data": { "Offset": <100ns>, "Duration": <100ns>, "text": { "Text": "…" } } } ] }
 *   관대하게 파싱: 단일 JSON → 실패 시 중괄호 깊이 스캐너로 여러 객체 수집
 * - 'No metadata received': audio.mp3가 있고 크기>0이면 성공(words: [] → 비례 타이밍), 아니면 재시도 가능 오류
 * - SSML로 감싸지므로 & < > " 는 이스케이프 (해시·자막은 원문 사용)
 */

export const EDGE_OUTPUT_FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;

/** SSML 텍스트 노드 이스케이프 */
export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EdgeMetadataItem {
  Type?: string;
  Data?: {
    Offset?: number;
    Duration?: number;
    text?: { Text?: string; Length?: number; BoundaryType?: string };
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** start(= '{')에서 시작하는 객체의 닫는 중괄호 위치 (문자열 리터럴 안의 중괄호는 무시), 못 닫으면 -1 */
function matchClose(raw: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 문자열에서 최상위 JSON 객체들을 잘라 파싱.
 * 잘린(닫히지 않은) 조각이나 파싱 실패 조각은 건너뛰고 그 다음 '{'부터 다시 시도하므로
 * 손상된 조각 뒤의 정상 객체도 살린다.
 */
export function scanJsonObjects(raw: string): unknown[] {
  const out: unknown[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const start = raw.indexOf("{", pos);
    if (start < 0) break;
    const end = matchClose(raw, start);
    if (end < 0) {
      pos = start + 1;
      continue;
    }
    try {
      out.push(JSON.parse(raw.slice(start, end + 1)));
      pos = end + 1;
    } catch {
      pos = start + 1;
    }
  }
  return out;
}

function collectItems(obj: unknown, into: EdgeMetadataItem[]): void {
  if (Array.isArray(obj)) {
    for (const o of obj) collectItems(o, into);
    return;
  }
  if (!isRecord(obj)) return;
  if (Array.isArray(obj.Metadata)) {
    for (const item of obj.Metadata) if (isRecord(item)) into.push(item as EdgeMetadataItem);
    return;
  }
  if (typeof obj.Type === "string") into.push(obj as EdgeMetadataItem);
}

/** Edge 메타데이터(JSON 또는 JSON 조각 연쇄) → WordBoundary 단어 타이밍(ms, 구두점 없음) */
export function parseEdgeMetadata(raw: string): WordTiming[] {
  const text = raw.trim();
  if (!text) return [];
  const items: EdgeMetadataItem[] = [];
  try {
    collectItems(JSON.parse(text), items);
  } catch {
    for (const obj of scanJsonObjects(text)) collectItems(obj, items);
  }
  const words: WordTiming[] = [];
  for (const item of items) {
    if (item.Type !== "WordBoundary") continue;
    const d = item.Data;
    const word = d?.text?.Text?.trim();
    if (!d || !word || typeof d.Offset !== "number") continue;
    const startMs = ticksToMs(d.Offset);
    const dur = typeof d.Duration === "number" ? ticksToMs(d.Duration) : 0;
    words.push({ text: word, startMs, endMs: startMs + Math.max(0, dur) });
  }
  return words;
}

export interface EdgeOptions {
  voice: string;
  rate: string;
}

async function fileSize(file: string): Promise<number> {
  try {
    const st = await fs.stat(file);
    return st.isFile() ? st.size : 0;
  } catch {
    return 0;
  }
}

/** Edge 공급자 생성 — 장면 호출마다 새 MsEdgeTTS 인스턴스(WebSocket) */
export function createEdgeSynthesizer(opts: EdgeOptions): SceneSynthesizer {
  return {
    provider: "edge",
    voice: opts.voice,
    rate: opts.rate,
    async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
      await fs.mkdir(req.workDir, { recursive: true });
      const audioTmp = path.join(req.workDir, "audio.mp3");
      const metaTmp = path.join(req.workDir, "metadata.json");
      // msedge-tts는 메타데이터가 없으면 unlinkSync(metadata.json)을 호출한다 — 파일이 없으면 ENOENT가
      // 이벤트 핸들러에서 던져져 프로세스가 죽으므로 빈 파일을 미리 만들어 둔다.
      await fs.writeFile(metaTmp, "");
      const tts = new MsEdgeTTS();
      const onAbort = () => tts.close();
      req.signal.addEventListener("abort", onAbort, { once: true });
      let metadataMissing = false;
      try {
        await tts.setMetadata(opts.voice, EDGE_OUTPUT_FORMAT, {
          wordBoundaryEnabled: true,
          sentenceBoundaryEnabled: true,
        });
        await tts.toFile(req.workDir, escapeSsml(req.text), { rate: opts.rate });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/No metadata received/i.test(msg)) {
          // 오디오는 왔지만 단어 경계가 없음 → 파일이 정상이면 비례 타이밍으로 진행
          await new Promise((r) => setTimeout(r, 500));
          if ((await fileSize(audioTmp)) > 0) metadataMissing = true;
          else throw new TtsError(`Edge TTS 메타데이터·오디오 없음: ${msg}`, { retryable: true, cause: err });
        } else if (req.signal.aborted) {
          throw new TtsError("Edge TTS 중단됨 (시간 초과)", { retryable: true, cause: err });
        } else {
          throw new TtsError(`Edge TTS 실패: ${msg}`, { retryable: true, cause: err });
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        tts.close();
      }
      if ((await fileSize(audioTmp)) <= 0) {
        throw new TtsError("Edge TTS: audio.mp3가 비어 있습니다", { retryable: true });
      }
      await fs.mkdir(path.dirname(req.outFile), { recursive: true });
      await fs.rm(req.outFile, { force: true });
      await fs.rename(audioTmp, req.outFile);
      if (metadataMissing) return { words: [], timed: false };
      const raw = await fs.readFile(metaTmp, "utf-8").catch(() => "");
      const words = parseEdgeMetadata(raw);
      return { words, timed: words.length > 0 };
    },
  };
}
