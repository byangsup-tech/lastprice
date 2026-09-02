import { promises as fs } from "fs";
import path from "path";
import { loadDotenvOnce } from "../dotenv";
import { fileExists, readJsonFile } from "../jobs";
import { buildInitialMetadata, sanitizeMetadata } from "../metadata";
import { jobPaths } from "../paths";
import type { Job, Privacy, Script, VideoMetadata } from "../types";
import { sleep } from "../util";

/**
 * 업로드 단계 — YouTube Data API v3 재개 가능(resumable) 업로드.
 *
 * 흐름: 토큰 갱신 → 세션 초기화(Location) → 8 MiB 청크 PUT(308 Range 재개, 5xx 백오프 + 상태 조회,
 *      404 세션 만료 시 초기화부터 1회 재시도) → 썸네일 → 자막(비치명).
 * 파일은 fs.open + read(offset, length)로 청크 단위로만 읽는다 (전체 mp4를 메모리에 올리지 않음).
 * job.json은 건드리지 않는다 — 결과(videoId/url/notes)는 오케스트레이터가 저장한다.
 * 네트워크 호출은 전부 주입 가능한 fetchImpl을 통해 이루어져 단위 테스트에서 가짜 서버로 대체할 수 있다.
 */

// ── 상수 ─────────────────────────────────────────────────────

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const UPLOAD_INIT_URL =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
export const THUMBNAIL_URL = "https://www.googleapis.com/upload/youtube/v3/thumbnails/set";
export const CAPTIONS_URL =
  "https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart";

/** 청크 정렬 단위 — 구글 재개 업로드는 256 KiB 배수만 허용 */
export const CHUNK_ALIGN = 256 * 1024;
/** 기본 청크 크기 8 MiB */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
/** 썸네일 상한 2 MB */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
/** 5xx/네트워크 오류 연속 재시도 횟수 */
export const MAX_RETRIES = 5;

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
export type SleepImpl = (ms: number) => Promise<void>;

export interface UploadCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface UploadJobOptions {
  privacy: Privacy;
  publishAt?: string;
  log?: (line: string) => void;
  onProgress?: (ratio: number) => void;
  /** 테스트 주입용 — 기본 globalThis.fetch */
  fetchImpl?: FetchImpl;
  /** 테스트 주입용 — 기본 util.sleep */
  sleepImpl?: SleepImpl;
  /** 테스트 주입용 — 기본 8 MiB (256 KiB 배수) */
  chunkSize?: number;
  /** 테스트 주입용 — 기본 환경변수 YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN */
  credentials?: UploadCredentials;
}

export interface UploadResult {
  videoId: string;
  url: string;
  notes: string[];
}

/** 세션이 만료(404)되어 초기화부터 다시 해야 할 때 */
export class UploadSessionExpiredError extends Error {
  constructor(message = "업로드 세션 만료(404)") {
    super(message);
    this.name = "UploadSessionExpiredError";
  }
}

// ── 순수 헬퍼 (단위 테스트 대상) ─────────────────────────────

/**
 * 308 응답의 `Range: bytes=0-N` 헤더 → 서버가 받은 마지막 바이트 N.
 * 헤더가 없거나 형식이 다르면 null (= 아무것도 받지 못함, 0부터 다시).
 */
export function parseRangeHeader(header: string | null | undefined): number | null {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d+)\s*-\s*(\d+)\s*$/i.exec(header);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null;
  return end;
}

/** Range 헤더 → 다음에 보낼 시작 오프셋 (없으면 0) */
export function nextOffsetFromRange(header: string | null | undefined): number {
  const last = parseRangeHeader(header);
  return last === null ? 0 : last + 1;
}

export interface ChunkRange {
  /** 포함 */
  start: number;
  /** 포함 — 마지막 청크는 size-1 */
  end: number;
  length: number;
}

/**
 * 파일 크기 → 청크 목록. chunk는 256 KiB 배수여야 하며(아니면 내림 정렬), from 이후만 계획한다.
 * 마지막 청크만 chunk보다 짧을 수 있고 end는 항상 size-1.
 */
export function chunkPlan(size: number, chunk = DEFAULT_CHUNK_SIZE, from = 0): ChunkRange[] {
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`잘못된 파일 크기: ${size}`);
  if (!Number.isSafeInteger(from) || from < 0 || from > size) throw new Error(`잘못된 시작 오프셋: ${from}`);
  const aligned = Math.max(CHUNK_ALIGN, Math.floor(chunk / CHUNK_ALIGN) * CHUNK_ALIGN);
  const plan: ChunkRange[] = [];
  for (let start = from; start < size; start += aligned) {
    const end = Math.min(start + aligned, size) - 1;
    plan.push({ start, end, length: end - start + 1 });
  }
  return plan;
}

/** 확장자 → 썸네일 content-type (png/jpg/jpeg만 허용) */
export function thumbnailContentType(file: string): "image/png" | "image/jpeg" | null {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return null;
}

/** captions.insert 용 multipart/related 본문 (JSON 파트 + application/octet-stream SRT 파트) */
export function buildMultipartCaption(
  metaJson: string,
  srt: string | Uint8Array,
  boundary: string,
): { body: Buffer; contentType: string } {
  if (!/^[A-Za-z0-9'()+_,\-./:=?]{1,70}$/.test(boundary)) {
    throw new Error("multipart boundary 형식이 잘못되었습니다");
  }
  const srtBuf = typeof srt === "string" ? Buffer.from(srt, "utf8") : Buffer.from(srt);
  const head = Buffer.from(
    `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${metaJson}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n",
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([head, srtBuf, tail]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

export interface VideoInsertBody {
  snippet: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    defaultLanguage: "ko";
    defaultAudioLanguage: "ko";
  };
  status: {
    privacyStatus: Privacy;
    publishAt?: string;
    selfDeclaredMadeForKids: false;
  };
}

/**
 * 메타데이터 + 공개 설정 → videos.insert 본문.
 * publishAt이 있으면 privacy는 반드시 private (아니면 400) — 강제 변환하고 note에 남긴다.
 */
export function buildInsertBody(
  meta: VideoMetadata,
  privacy: Privacy,
  publishAt?: string,
): { body: VideoInsertBody; notes: string[] } {
  const notes: string[] = [];
  let privacyStatus = privacy;
  let publishAtIso: string | undefined;
  if (publishAt && publishAt.trim()) {
    const d = new Date(publishAt);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`publishAt 형식이 잘못되었습니다 (ISO 8601 필요): ${publishAt}`);
    }
    publishAtIso = d.toISOString();
    if (d.getTime() <= Date.now()) notes.push(`publishAt이 과거 시각입니다 (${publishAtIso}) — 즉시 공개될 수 있음`);
    if (privacyStatus !== "private") {
      notes.push(`publishAt 지정 → privacy를 ${privacyStatus}에서 private으로 강제 변환 (예약 공개 규칙)`);
      privacyStatus = "private";
    }
  }
  const status: VideoInsertBody["status"] = { privacyStatus, selfDeclaredMadeForKids: false };
  if (publishAtIso) status.publishAt = publishAtIso;
  return {
    body: {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
        categoryId: meta.categoryId || "27",
        defaultLanguage: "ko",
        defaultAudioLanguage: "ko",
      },
      status,
    },
    notes,
  };
}

// ── 공통 유틸 ────────────────────────────────────────────────

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** 환경변수에서 업로드 자격 증명 로드 (없으면 한국어 안내와 함께 throw) */
export function resolveUploadCredentials(): UploadCredentials {
  loadDotenvOnce();
  const clientId = env("YOUTUBE_CLIENT_ID");
  const clientSecret = env("YOUTUBE_CLIENT_SECRET");
  const refreshToken = env("YOUTUBE_REFRESH_TOKEN");
  const missing = [
    !clientId && "YOUTUBE_CLIENT_ID",
    !clientSecret && "YOUTUBE_CLIENT_SECRET",
    !refreshToken && "YOUTUBE_REFRESH_TOKEN",
  ].filter((s): s is string => typeof s === "string");
  if (missing.length || !clientId || !clientSecret || !refreshToken) {
    throw new Error(
      `YouTube 업로드 자격 증명이 없습니다 (${missing.join(", ")}) — .env.local에 설정하거나 npm run yt -- auth 로 발급하세요`,
    );
  }
  return { clientId, clientSecret, refreshToken };
}

async function readBodyText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 2000);
  } catch {
    return "";
  }
}

function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function isNetworkError(e: unknown): boolean {
  return e instanceof Error && !(e instanceof UploadSessionExpiredError) && !(e instanceof UploadHttpError);
}

/** 재시도 불가능한 HTTP 오류 (4xx 등) */
export class UploadHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, context: string) {
    super(`${context} 실패 (HTTP ${status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    this.name = "UploadHttpError";
    this.status = status;
    this.body = body;
  }
}

// ── 토큰 ─────────────────────────────────────────────────────

/**
 * refresh_token → access_token. invalid_grant면 재인증 안내 메시지로 throw.
 */
export async function getAccessToken(
  creds: UploadCredentials,
  fetchImpl: FetchImpl = globalThis.fetch,
): Promise<string> {
  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await readBodyText(res);
  let parsed: { access_token?: string; error?: string; error_description?: string } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // 본문이 JSON이 아님 — 아래에서 상태코드로 처리
  }
  if (!res.ok) {
    if (parsed.error === "invalid_grant") {
      throw new Error(
        "YouTube 토큰 만료/철회(invalid_grant) — npm run yt -- auth 재실행 후 YOUTUBE_REFRESH_TOKEN을 갱신하세요 (게시 전 앱은 리프레시 토큰이 7일 만에 만료됩니다)",
      );
    }
    throw new Error(
      `YouTube 토큰 갱신 실패 (HTTP ${res.status}): ${parsed.error ?? ""} ${parsed.error_description ?? text}`.trim(),
    );
  }
  if (!parsed.access_token) throw new Error("YouTube 토큰 응답에 access_token이 없습니다");
  return parsed.access_token;
}

// ── 재개 가능 업로드 ─────────────────────────────────────────

/** 세션 초기화 → Location(세션 URL) */
export async function initResumableSession(
  token: string,
  body: VideoInsertBody,
  size: number,
  fetchImpl: FetchImpl,
): Promise<string> {
  const res = await fetchImpl(UPLOAD_INIT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(size),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new UploadHttpError(res.status, await readBodyText(res), "업로드 세션 초기화");
  const location = res.headers.get("location");
  if (!location) throw new Error("업로드 세션 초기화 응답에 Location 헤더가 없습니다");
  return location;
}

function parseVideoId(text: string): string {
  let parsed: { id?: unknown } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // 아래에서 처리
  }
  if (typeof parsed.id !== "string" || !parsed.id) {
    throw new Error(`업로드 완료 응답에 id가 없습니다: ${text.slice(0, 200)}`);
  }
  return parsed.id;
}

export interface ChunkUploadOptions {
  token: string;
  sessionUrl: string;
  filePath: string;
  size: number;
  fetchImpl: FetchImpl;
  sleepImpl?: SleepImpl;
  chunkSize?: number;
  log?: (line: string) => void;
  onProgress?: (ratio: number) => void;
  /** 401(토큰 만료) 시 새 토큰을 얻는 함수 — 없으면 401은 오류 */
  refreshToken?: () => Promise<string>;
}

/**
 * 세션 URL로 파일을 청크 단위 PUT. 완료 시 videoId 반환.
 * - 308: Range 헤더로 다음 오프셋 계산 후 계속
 * - 5xx/네트워크: 백오프 → 상태 조회(bytes * / size) → 재개 (연속 MAX_RETRIES회 초과 시 throw)
 * - 404: UploadSessionExpiredError (호출자가 초기화부터 재시도)
 * - 401: refreshToken이 있으면 1회 갱신 후 같은 청크 재전송
 */
export async function uploadChunks(opts: ChunkUploadOptions): Promise<string> {
  const { sessionUrl, filePath, size, fetchImpl } = opts;
  const sleepImpl = opts.sleepImpl ?? sleep;
  const log = opts.log ?? (() => {});
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  let token = opts.token;
  let offset = 0;
  let failures = 0;
  let refreshed = false;

  const handle = await fs.open(filePath, "r");
  try {
    while (offset < size) {
      const [chunk] = chunkPlan(size, chunkSize, offset);
      const buf = new Uint8Array(chunk.length);
      let read = 0;
      while (read < chunk.length) {
        const r = await handle.read(buf, read, chunk.length - read, chunk.start + read);
        if (r.bytesRead <= 0) throw new Error(`파일 읽기 실패 (offset ${chunk.start + read})`);
        read += r.bytesRead;
      }

      let res: Response;
      try {
        res = await fetchImpl(sessionUrl, {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "video/mp4",
            "content-range": `bytes ${chunk.start}-${chunk.end}/${size}`,
          },
          body: buf,
        });
      } catch (e) {
        if (!isNetworkError(e)) throw e;
        failures += 1;
        if (failures > MAX_RETRIES) throw new Error(`업로드 네트워크 오류 반복 — 중단: ${(e as Error).message}`);
        log(`네트워크 오류 (${failures}/${MAX_RETRIES}) — ${backoffMs(failures - 1)}ms 후 상태 조회: ${(e as Error).message}`);
        await sleepImpl(backoffMs(failures - 1));
        const st = await queryStatus();
        if (st.done !== undefined) return finish(st.done);
        offset = st.offset;
        continue;
      }

      if (res.status === 200 || res.status === 201) {
        return finish(parseVideoId(await readBodyText(res)));
      }
      if (res.status === 308) {
        failures = 0;
        offset = nextOffsetFromRange(res.headers.get("range"));
        opts.onProgress?.(Math.min(1, offset / size));
        continue;
      }
      if (res.status === 404) throw new UploadSessionExpiredError();
      if (res.status === 401 && opts.refreshToken && !refreshed) {
        refreshed = true;
        log("액세스 토큰 만료(401) — 토큰 갱신 후 재전송");
        token = await opts.refreshToken();
        continue;
      }
      if (res.status >= 500) {
        failures += 1;
        const body = await readBodyText(res);
        if (failures > MAX_RETRIES) throw new UploadHttpError(res.status, body, "업로드 서버 오류 반복 — 중단");
        log(`서버 오류 HTTP ${res.status} (${failures}/${MAX_RETRIES}) — ${backoffMs(failures - 1)}ms 후 상태 조회`);
        await sleepImpl(backoffMs(failures - 1));
        const st = await queryStatus();
        if (st.done !== undefined) return finish(st.done);
        offset = st.offset;
        continue;
      }
      throw new UploadHttpError(res.status, await readBodyText(res), "청크 업로드");
    }
    // offset이 size에 도달했는데 200이 안 온 경우(308으로 전부 수신 확인) — 상태 조회로 마무리
    const st = await queryStatus();
    if (st.done !== undefined) return finish(st.done);
    throw new Error(`업로드가 끝났지만 완료 응답을 받지 못했습니다 (서버 수신 ${st.offset}/${size})`);
  } finally {
    await handle.close();
  }

  function finish(videoId: string): string {
    opts.onProgress?.(1);
    return videoId;
  }

  async function queryStatusRaw(): Promise<Response> {
    return fetchImpl(sessionUrl, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-range": `bytes */${size}`,
      },
    });
  }

  /** 상태 조회 → 다음 오프셋 또는 (이미 완료된 경우) videoId */
  async function queryStatus(): Promise<{ offset: number; done?: string }> {
    for (;;) {
      let res: Response;
      try {
        res = await queryStatusRaw();
      } catch (e) {
        failures += 1;
        if (failures > MAX_RETRIES) throw new Error(`상태 조회 네트워크 오류 반복 — 중단: ${(e as Error).message}`);
        await sleepImpl(backoffMs(failures - 1));
        continue;
      }
      if (res.status === 308) {
        const next = nextOffsetFromRange(res.headers.get("range"));
        log(`상태 조회 → ${next}/${size} 바이트 수신 확인, 재개`);
        return { offset: next };
      }
      if (res.status === 200 || res.status === 201) {
        // 이미 완료됨
        return { offset: size, done: parseVideoId(await readBodyText(res)) };
      }
      if (res.status === 404) throw new UploadSessionExpiredError();
      if (res.status >= 500) {
        failures += 1;
        if (failures > MAX_RETRIES) throw new UploadHttpError(res.status, await readBodyText(res), "상태 조회 서버 오류 반복");
        await sleepImpl(backoffMs(failures - 1));
        continue;
      }
      throw new UploadHttpError(res.status, await readBodyText(res), "업로드 상태 조회");
    }
  }
}

// ── 부가 업로드 (비치명) ─────────────────────────────────────

/** 썸네일 업로드 — 실패는 note 문자열로 반환 (throw 없음) */
export async function uploadThumbnail(
  token: string,
  videoId: string,
  file: string,
  fetchImpl: FetchImpl,
): Promise<{ ok: boolean; note?: string }> {
  const contentType = thumbnailContentType(file);
  if (!contentType) return { ok: false, note: `썸네일 건너뜀 — 지원하지 않는 확장자 (${path.basename(file)})` };
  let data: Buffer;
  try {
    const st = await fs.stat(file);
    if (st.size > THUMBNAIL_MAX_BYTES) {
      return { ok: false, note: `썸네일 건너뜀 — ${(st.size / 1024 / 1024).toFixed(2)}MB > 2MB 제한` };
    }
    data = await fs.readFile(file);
  } catch (e) {
    return { ok: false, note: `썸네일 읽기 실패 — ${(e as Error).message}` };
  }
  try {
    const res = await fetchImpl(`${THUMBNAIL_URL}?videoId=${encodeURIComponent(videoId)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body: new Uint8Array(data), // 복사 — ArrayBufferLike 기반 Buffer는 BodyInit에 직접 못 넘김 (≤2MB)
    });
    if (!res.ok) {
      const body = await readBodyText(res);
      const hint = res.status === 403 ? " (채널 인증(전화번호 확인)이 필요할 수 있음)" : "";
      return { ok: false, note: `썸네일 업로드 실패 (HTTP ${res.status})${hint}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, note: `썸네일 업로드 실패 — ${(e as Error).message}` };
  }
}

/** 자막(SRT) 업로드 — captions.insert multipart/related. 실패는 note로 반환 */
export async function uploadCaptions(
  token: string,
  videoId: string,
  srtFile: string,
  fetchImpl: FetchImpl,
  boundary = `yt_caption_${Date.now().toString(36)}`,
): Promise<{ ok: boolean; note?: string }> {
  let srt: Buffer;
  try {
    srt = await fs.readFile(srtFile);
  } catch (e) {
    return { ok: false, note: `자막 읽기 실패 — ${(e as Error).message}` };
  }
  if (srt.length === 0) return { ok: false, note: "자막 건너뜀 — subtitles.srt가 비어 있음" };
  const metaJson = JSON.stringify({
    snippet: { videoId, language: "ko", name: "한국어", isDraft: false },
  });
  const { body, contentType } = buildMultipartCaption(metaJson, srt, boundary);
  try {
    const res = await fetchImpl(CAPTIONS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": contentType },
      body: new Uint8Array(body), // 복사 (자막은 작다)
    });
    if (!res.ok) {
      const text = await readBodyText(res);
      return { ok: false, note: `자막 업로드 실패 (HTTP ${res.status}): ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, note: `자막 업로드 실패 — ${(e as Error).message}` };
  }
}

// ── 단계 진입점 ──────────────────────────────────────────────

async function pickThumbnail(job: Job, p: ReturnType<typeof jobPaths>): Promise<string | null> {
  const candidates = [job.outputs.thumbnailPath, p.thumbnailPng, p.thumbnailJpg].filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  for (const c of candidates) if (await fileExists(c)) return c;
  return null;
}

async function loadMetadataForJob(p: ReturnType<typeof jobPaths>): Promise<VideoMetadata> {
  const meta = await readJsonFile<VideoMetadata>(p.metadataFile);
  if (meta && typeof meta.title === "string") return meta;
  const script = await readJsonFile<Script>(p.scriptFile);
  if (script && typeof script.title === "string") return buildInitialMetadata(script);
  throw new Error("metadata.json/script.json이 없습니다 — script 단계를 먼저 실행하세요");
}

/**
 * 작업의 final.mp4를 YouTube에 업로드한다.
 * 반환: { videoId, url, notes } — notes에는 메타 정제·privacy 강제·썸네일/자막 비치명 실패가 담긴다.
 */
export async function uploadJobVideo(job: Job, opts: UploadJobOptions): Promise<UploadResult> {
  const log = opts.log ?? (() => {});
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const sleepImpl = opts.sleepImpl ?? sleep;
  const p = jobPaths(job.id);
  const notes: string[] = [];

  // 1) 입력 확인
  const videoPath = job.outputs.videoPath && (await fileExists(job.outputs.videoPath))
    ? job.outputs.videoPath
    : p.finalVideo;
  if (!(await fileExists(videoPath))) {
    throw new Error("final.mp4가 없습니다 — render 단계를 먼저 실행하세요");
  }
  const size = (await fs.stat(videoPath)).size;

  // 2) 메타데이터 정제
  const rawMeta = await loadMetadataForJob(p);
  const sanitized = sanitizeMetadata(rawMeta);
  notes.push(...sanitized.notes);
  const insert = buildInsertBody(sanitized.meta, opts.privacy, opts.publishAt);
  notes.push(...insert.notes);
  for (const n of [...sanitized.notes, ...insert.notes]) log(`메모: ${n}`);

  // 3) 토큰
  const creds = opts.credentials ?? resolveUploadCredentials();
  let token = await getAccessToken(creds, fetchImpl);
  const refreshToken = async () => {
    token = await getAccessToken(creds, fetchImpl);
    return token;
  };
  log(`업로드 시작: ${path.basename(videoPath)} (${(size / 1024 / 1024).toFixed(1)} MB, ${insert.body.status.privacyStatus}${insert.body.status.publishAt ? `, 예약 ${insert.body.status.publishAt}` : ""})`);

  // 4) 세션 초기화 + 청크 업로드 (404 세션 만료 시 초기화부터 1회 재시도)
  let videoId: string | null = null;
  for (let attempt = 0; attempt < 2 && videoId === null; attempt++) {
    const sessionUrl = await initResumableSession(token, insert.body, size, fetchImpl);
    log(`업로드 세션 초기화 완료${attempt ? " (재시도)" : ""}`);
    try {
      videoId = await uploadChunks({
        token,
        sessionUrl,
        filePath: videoPath,
        size,
        fetchImpl,
        sleepImpl,
        chunkSize: opts.chunkSize,
        log,
        onProgress: opts.onProgress,
        refreshToken,
      });
    } catch (e) {
      if (e instanceof UploadSessionExpiredError && attempt === 0) {
        log("업로드 세션 만료(404) — 세션을 다시 초기화합니다");
        notes.push("업로드 세션 만료로 재초기화 1회");
        continue;
      }
      throw e;
    }
  }
  if (!videoId) throw new Error("업로드 세션을 두 번 초기화했지만 완료하지 못했습니다");
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  log(`업로드 완료: ${url}`);

  // 5) 썸네일 (비치명)
  const thumb = await pickThumbnail(job, p);
  if (!thumb) {
    notes.push("썸네일 파일 없음 — 건너뜀");
  } else {
    const r = await uploadThumbnail(token, videoId, thumb, fetchImpl);
    if (r.ok) log(`썸네일 업로드 완료 (${path.basename(thumb)})`);
    else if (r.note) {
      notes.push(r.note);
      log(`경고: ${r.note}`);
    }
  }

  // 6) 자막 (비치명)
  const srtPath = job.outputs.srtPath && (await fileExists(job.outputs.srtPath)) ? job.outputs.srtPath : p.srtFile;
  if (!(await fileExists(srtPath))) {
    notes.push("subtitles.srt 없음 — 자막 업로드 건너뜀");
  } else {
    const r = await uploadCaptions(token, videoId, srtPath, fetchImpl);
    if (r.ok) log("자막 업로드 완료 (ko)");
    else if (r.note) {
      notes.push(r.note);
      log(`경고: ${r.note}`);
    }
  }

  return { videoId, url, notes };
}
