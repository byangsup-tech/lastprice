import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { CAPTIONS_URL, CHUNK_ALIGN, THUMBNAIL_URL, TOKEN_URL, UPLOAD_INIT_URL, type FetchImpl } from "./youtube-upload";

/**
 * 테스트용 가짜 YouTube 서버 — 재개 가능 업로드 프로토콜을 인메모리로 구현한다.
 * (단위 테스트와 스모크 스크립트가 함께 사용. 이 파일 자체의 테스트는 맨 아래 자가 검증 하나뿐)
 *
 * 청크 PUT마다 script[n] 동작을 적용한다:
 *  - "ok"            청크 전체 수신 → 308(Range) 또는 마지막이면 200 {id}
 *  - "partial"       앞 절반(256 KiB 정렬)만 수신 → 308 Range로 재개 유도
 *  - "503"           수신하지 않고 503
 *  - "503-accepted"  수신은 했지만 503 (상태 조회로만 진행 확인 가능)
 *  - "404"           세션 만료 — 404 (수신 상태 초기화)
 *  - "network"       fetch 자체가 실패 (TypeError)
 *  - "401"           토큰 만료
 * script가 끝나면 "ok".
 */

export type ChunkBehavior = "ok" | "partial" | "503" | "503-accepted" | "404" | "network" | "401";

export interface FakeCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyBytes: number;
  bodyText?: string;
}

export interface FakeYouTubeOptions {
  size: number;
  script?: ChunkBehavior[];
  videoId?: string;
  tokenError?: "invalid_grant" | "server_error" | null;
  thumbnailStatus?: number;
  captionStatus?: number;
}

export interface FakeYouTube {
  fetch: FetchImpl;
  calls: FakeCall[];
  /** 수락된 청크 범위 (세션 순서대로) */
  accepted: { session: number; start: number; end: number }[];
  /** 상태 조회(content-range `bytes * / size`) 횟수 */
  statusQueries: number;
  sessions: number;
  received: number;
  violations: string[];
  /** 마지막 세션에서 수락한 바이트의 sha256 (전부 수신했을 때만 의미 있음) */
  receivedSha256(): string;
  tokensIssued: number;
  thumbnail?: { contentType: string; bytes: number };
  caption?: { contentType: string; body: Buffer };
}

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init?.headers) return out;
  new Headers(init.headers).forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function bodyBuffer(init?: RequestInit): Buffer {
  const b = init?.body;
  if (!b) return Buffer.alloc(0);
  if (typeof b === "string") return Buffer.from(b, "utf8");
  if (b instanceof Uint8Array) return Buffer.from(b.buffer, b.byteOffset, b.byteLength);
  if (b instanceof ArrayBuffer) return Buffer.from(b);
  throw new Error("fake: 지원하지 않는 body 타입");
}

function json(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

export function createFakeYouTube(opts: FakeYouTubeOptions): FakeYouTube {
  const script = [...(opts.script ?? [])];
  const videoId = opts.videoId ?? "vid_fake_123";
  let hash = createHash("sha256");
  const state: FakeYouTube = {
    calls: [],
    accepted: [],
    statusQueries: 0,
    sessions: 0,
    received: 0,
    violations: [],
    tokensIssued: 0,
    receivedSha256: () => hash.copy().digest("hex"),
    fetch: async (url, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = headersOf(init);
      const body = bodyBuffer(init);
      const call: FakeCall = { method, url, headers, bodyBytes: body.length };
      if (headers["content-type"]?.startsWith("application/") && body.length < 100_000) call.bodyText = body.toString("utf8");
      state.calls.push(call);

      // ── 토큰 ──
      if (url === TOKEN_URL) {
        const form = new URLSearchParams(body.toString("utf8"));
        if (form.get("grant_type") !== "refresh_token") {
          state.violations.push("token: grant_type !== refresh_token");
        }
        if (opts.tokenError === "invalid_grant") {
          return json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        }
        if (opts.tokenError === "server_error") return json(500, { error: "internal" });
        state.tokensIssued += 1;
        return json(200, { access_token: `tok-${state.tokensIssued}`, expires_in: 3599, token_type: "Bearer" });
      }

      if (!headers.authorization?.startsWith("Bearer tok-")) {
        state.violations.push(`${method} ${url}: authorization 헤더 없음`);
        return json(401, { error: { code: 401, message: "Login Required" } });
      }

      // ── 세션 초기화 ──
      if (url === UPLOAD_INIT_URL && method === "POST") {
        if (headers["x-upload-content-type"] !== "video/mp4") state.violations.push("init: x-upload-content-type");
        if (headers["x-upload-content-length"] !== String(opts.size)) state.violations.push("init: x-upload-content-length");
        if (!headers["content-type"]?.startsWith("application/json")) state.violations.push("init: content-type");
        try {
          const parsed = JSON.parse(body.toString("utf8")) as { snippet?: { title?: string }; status?: { privacyStatus?: string; publishAt?: string } };
          if (!parsed.snippet?.title) state.violations.push("init: snippet.title 없음");
          if (parsed.status?.publishAt && parsed.status.privacyStatus !== "private") {
            return json(400, { error: { code: 400, message: "publishAt requires private" } });
          }
        } catch {
          state.violations.push("init: JSON 본문 아님");
        }
        state.sessions += 1;
        state.received = 0;
        hash = createHash("sha256");
        return new Response(null, { status: 200, headers: { location: `https://upload.fake/session/${state.sessions}` } });
      }

      // ── 청크 PUT / 상태 조회 ──
      if (url.startsWith("https://upload.fake/session/") && method === "PUT") {
        const sessionNo = Number(url.split("/").pop());
        if (sessionNo !== state.sessions) return json(404, { error: { code: 404, message: "stale session" } });
        const cr = headers["content-range"] ?? "";
        const statusQuery = /^bytes \*\/(\d+)$/.exec(cr);
        if (statusQuery) {
          state.statusQueries += 1;
          if (body.length !== 0) state.violations.push("status query: 본문이 비어 있지 않음");
          if (state.received >= opts.size) return json(200, { id: videoId });
          const h: Record<string, string> = {};
          if (state.received > 0) h.range = `bytes=0-${state.received - 1}`;
          return new Response(null, { status: 308, headers: h });
        }
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
        if (!m) {
          state.violations.push(`chunk: content-range 형식 오류 '${cr}'`);
          return json(400, { error: "bad content-range" });
        }
        const start = Number(m[1]);
        const end = Number(m[2]);
        const total = Number(m[3]);
        if (total !== opts.size) state.violations.push(`chunk: total ${total} !== ${opts.size}`);
        if (headers["content-type"] !== "video/mp4") state.violations.push("chunk: content-type !== video/mp4");
        if (end - start + 1 !== body.length) state.violations.push(`chunk: 범위 길이 ${end - start + 1} !== 본문 ${body.length}`);
        if (start !== state.received) state.violations.push(`chunk: start ${start} !== 수신 ${state.received}`);
        if (start % CHUNK_ALIGN !== 0) state.violations.push(`chunk: start ${start} 256KiB 비정렬`);
        if (end !== opts.size - 1 && body.length % CHUNK_ALIGN !== 0) {
          state.violations.push(`chunk: 마지막이 아닌 청크 길이 ${body.length} 256KiB 비정렬`);
        }

        const behavior = script.shift() ?? "ok";
        if (behavior === "network") throw new TypeError("fetch failed");
        if (behavior === "401") return json(401, { error: { code: 401, message: "Invalid Credentials" } });
        if (behavior === "404") {
          state.received = 0;
          return json(404, { error: { code: 404, message: "Not Found" } });
        }
        if (behavior === "503") return json(503, { error: { code: 503, message: "Backend Error" } });

        if (start !== state.received) {
          // 실제 서버처럼 어긋난 청크는 거부하고 현재 위치를 알려준다
          const h: Record<string, string> = {};
          if (state.received > 0) h.range = `bytes=0-${state.received - 1}`;
          return new Response(null, { status: 308, headers: h });
        }

        let acceptLen = body.length;
        if (behavior === "partial") {
          acceptLen = Math.max(CHUNK_ALIGN, Math.floor(body.length / 2 / CHUNK_ALIGN) * CHUNK_ALIGN);
          if (acceptLen >= body.length) acceptLen = body.length; // 아주 작은 청크면 전부 수락
        }
        hash.update(body.subarray(0, acceptLen));
        state.received += acceptLen;
        state.accepted.push({ session: state.sessions, start, end: start + acceptLen - 1 });

        if (behavior === "503-accepted") return json(503, { error: { code: 503, message: "Backend Error (after accept)" } });
        if (state.received >= opts.size) return json(200, { id: videoId, kind: "youtube#video" });
        return new Response(null, { status: 308, headers: { range: `bytes=0-${state.received - 1}` } });
      }

      // ── 썸네일 ──
      if (url.startsWith(`${THUMBNAIL_URL}?videoId=`) && method === "POST") {
        const ct = headers["content-type"] ?? "";
        if (ct !== "image/png" && ct !== "image/jpeg") state.violations.push(`thumbnail: content-type ${ct}`);
        if (!url.endsWith(encodeURIComponent(videoId))) state.violations.push("thumbnail: videoId 불일치");
        state.thumbnail = { contentType: ct, bytes: body.length };
        const status = opts.thumbnailStatus ?? 200;
        return json(status, status < 300 ? { items: [{ default: { url: "x" } }] } : { error: { code: status, message: "thumb fail" } });
      }

      // ── 자막 ──
      if (url === CAPTIONS_URL && method === "POST") {
        const ct = headers["content-type"] ?? "";
        if (!ct.startsWith("multipart/related; boundary=")) state.violations.push(`caption: content-type ${ct}`);
        state.caption = { contentType: ct, body };
        const status = opts.captionStatus ?? 200;
        return json(status, status < 300 ? { id: "cap_1" } : { error: { code: status, message: "caption fail" } });
      }

      state.violations.push(`알 수 없는 요청 ${method} ${url}`);
      return json(404, { error: "unknown" });
    },
  };
  return state;
}

test("fake-youtube — 자가 검증: 상태 조회와 청크 수락", async () => {
  const fake = createFakeYouTube({ size: 3 * CHUNK_ALIGN });
  const token = await fake.fetch(TOKEN_URL, { method: "POST", body: "grant_type=refresh_token" });
  assert.equal(token.status, 200);
  const init = await fake.fetch(UPLOAD_INIT_URL, {
    method: "POST",
    headers: {
      authorization: "Bearer tok-1",
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(3 * CHUNK_ALIGN),
    },
    body: JSON.stringify({ snippet: { title: "t" }, status: { privacyStatus: "private" } }),
  });
  const loc = init.headers.get("location");
  assert.ok(loc);
  const st = await fake.fetch(loc, { method: "PUT", headers: { authorization: "Bearer tok-1", "content-range": `bytes */${3 * CHUNK_ALIGN}` } });
  assert.equal(st.status, 308);
  assert.equal(st.headers.get("range"), null);
  const put = await fake.fetch(loc, {
    method: "PUT",
    headers: { authorization: "Bearer tok-1", "content-type": "video/mp4", "content-range": `bytes 0-${2 * CHUNK_ALIGN - 1}/${3 * CHUNK_ALIGN}` },
    body: new Uint8Array(2 * CHUNK_ALIGN),
  });
  assert.equal(put.status, 308);
  assert.equal(put.headers.get("range"), `bytes=0-${2 * CHUNK_ALIGN - 1}`);
  assert.deepEqual(fake.violations, []);
});
