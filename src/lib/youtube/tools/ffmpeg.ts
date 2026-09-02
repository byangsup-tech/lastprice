import { spawn, spawnSync } from "child_process";
import { createRequire } from "module";
import type { ToolStatus } from "../types";

/**
 * ffmpeg 바이너리 해석 + 실행 헬퍼.
 * 해석 순서: FFMPEG_PATH → PATH의 ffmpeg → @ffmpeg-installer/ffmpeg (npm 정적 빌드, ≈4.1)
 *
 * 주의: 정적 빌드(2018)에는 xfade가 없고 ffprobe도 없다. 길이는 probeDuration()으로 잰다.
 * 인자는 항상 배열로 spawn — 셸 문자열 금지.
 */

let cached: ToolStatus | null = null;

function tryVersion(bin: string): string | null {
  try {
    const r = spawnSync(bin, ["-version"], { encoding: "utf-8", timeout: 10_000 });
    if (r.status !== 0 || !r.stdout) return null;
    const m = /ffmpeg version (\S+)/.exec(r.stdout);
    return m ? m[1] : "unknown";
  } catch {
    return null;
  }
}

export function resolveFfmpeg(): ToolStatus {
  if (cached) return cached;
  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH?.trim()) candidates.push(process.env.FFMPEG_PATH.trim());
  candidates.push("ffmpeg");
  try {
    const req = createRequire(import.meta.url);
    const installer = req("@ffmpeg-installer/ffmpeg") as { path: string };
    if (installer?.path) candidates.push(installer.path);
  } catch {
    // 패키지 미설치 — 아래에서 에러 보고
  }
  for (const bin of candidates) {
    const version = tryVersion(bin);
    if (version) {
      cached = { ok: true, path: bin, version };
      return cached;
    }
  }
  cached = {
    ok: false,
    error:
      "ffmpeg를 찾지 못했습니다. FFMPEG_PATH를 설정하거나 `npm i @ffmpeg-installer/ffmpeg`, 또는 시스템에 ffmpeg를 설치하세요.",
  };
  return cached;
}

export function ffmpegPath(): string {
  const s = resolveFfmpeg();
  if (!s.ok || !s.path) throw new Error(s.error ?? "ffmpeg 없음");
  return s.path;
}

export interface RunFfmpegOptions {
  cwd?: string;
  /** stderr의 time= 진행률 콜백 (0..1) — totalMs가 있을 때 */
  totalMs?: number;
  onProgress?: (ratio: number) => void;
  /** 전체 stderr를 남길 로그 콜백 */
  onLog?: (line: string) => void;
  timeoutMs?: number;
}

/** "HH:MM:SS.xx" → ms */
export function parseTimestampMs(ts: string): number | null {
  const m = /(\d+):(\d\d):(\d\d)(?:\.(\d+))?/.exec(ts);
  if (!m) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Math.round(((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3]) + frac) * 1000);
}

/** ffmpeg stderr에서 Duration: 라인을 파싱 (없으면 null) */
export function parseDurationMs(stderr: string): number | null {
  const m = /Duration:\s*(\d+:\d\d:\d\d\.\d+)/.exec(stderr);
  if (m) return parseTimestampMs(m[1]);
  // 디코드 끝의 마지막 time= 값 (Duration이 N/A인 스트림용)
  const times = [...stderr.matchAll(/time=(\d+:\d\d:\d\d\.\d+)/g)];
  if (times.length) return parseTimestampMs(times[times.length - 1][1]);
  return null;
}

export function runFfmpeg(args: string[], opts: RunFfmpegOptions = {}): Promise<{ stderr: string }> {
  const bin = ffmpegPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", ...args], {
      cwd: opts.cwd,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`ffmpeg 시간 초과 (${opts.timeoutMs} ms)`));
      }, opts.timeoutMs);
    }
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      if (opts.onLog) {
        for (const line of chunk.split(/\r?\n/)) if (line.trim()) opts.onLog(line);
      }
      if (opts.onProgress && opts.totalMs) {
        const m = /time=(\d+:\d\d:\d\d\.\d+)/.exec(chunk);
        if (m) {
          const ms = parseTimestampMs(m[1]);
          if (ms !== null) opts.onProgress(Math.min(1, ms / opts.totalMs));
        }
      }
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else {
        const tail = stderr.split("\n").filter(Boolean).slice(-15).join("\n");
        reject(new Error(`ffmpeg 종료 코드 ${code}\n${tail}`));
      }
    });
  });
}

/** 미디어 파일 길이(ms) — ffprobe 없이 ffmpeg 디코드로 측정 */
export async function probeDuration(file: string): Promise<number> {
  const bin = ffmpegPath();
  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ["-hide_banner", "-nostdin", "-i", file, "-f", "null", "-"], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (c: string) => (stderr += c));
    child.on("error", reject);
    child.on("close", () => resolve(stderr));
  });
  // 실제 디코드 길이(time=)가 헤더 Duration보다 정확하므로 우선
  const times = [...out.matchAll(/time=(\d+:\d\d:\d\d\.\d+)/g)];
  if (times.length) {
    const ms = parseTimestampMs(times[times.length - 1][1]);
    if (ms !== null && ms > 0) return ms;
  }
  const ms = parseDurationMs(out);
  if (ms === null) throw new Error(`길이를 측정할 수 없습니다: ${file}`);
  return ms;
}

/**
 * ffmpeg 필터 옵션 값(파일 경로 등) 이스케이프.
 * 필터 그래프에서 ':'는 옵션 구분자, '\'는 이스케이프, "'"는 인용 부호이므로 처리한다.
 */
export function escapeFilterPath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/'/g, "\\\\\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/** concat demuxer 목록 파일의 한 줄 — 작은따옴표는 '\'' 로 */
export function concatListLine(file: string): string {
  return `file '${file.replace(/'/g, "'\\''")}'`;
}
