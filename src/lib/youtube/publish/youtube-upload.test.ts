import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { createHash, randomBytes } from "crypto";
import { jobPaths } from "../paths";
import type { Job, VideoMetadata } from "../types";
import {
  CHUNK_ALIGN,
  buildInsertBody,
  buildMultipartCaption,
  chunkPlan,
  getAccessToken,
  nextOffsetFromRange,
  parseRangeHeader,
  thumbnailContentType,
  uploadJobVideo,
  type UploadCredentials,
} from "./youtube-upload";
import { createFakeYouTube, type ChunkBehavior } from "./fake-youtube.test";

// ── 순수 헬퍼 ────────────────────────────────────────────────

test("parseRangeHeader — bytes=0-N 파싱, 이상값은 null", () => {
  assert.equal(parseRangeHeader("bytes=0-8388607"), 8388607);
  assert.equal(parseRangeHeader("Bytes = 0 - 10"), 10);
  assert.equal(parseRangeHeader(null), null);
  assert.equal(parseRangeHeader(undefined), null);
  assert.equal(parseRangeHeader(""), null);
  assert.equal(parseRangeHeader("bytes=0-"), null);
  assert.equal(parseRangeHeader("bytes 0-10/100"), null);
  assert.equal(parseRangeHeader("bytes=10-5"), null);
  assert.equal(nextOffsetFromRange("bytes=0-262143"), 262144);
  assert.equal(nextOffsetFromRange(null), 0);
});

test("chunkPlan — 256 KiB 정렬, 마지막 end = size-1", () => {
  const MiB = 1024 * 1024;
  const size = 20 * MiB + 12345;
  const plan = chunkPlan(size, 8 * MiB);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((c) => c.start), [0, 8 * MiB, 16 * MiB]);
  assert.equal(plan[plan.length - 1].end, size - 1);
  assert.equal(plan[2].length, 4 * MiB + 12345);
  for (const c of plan) assert.equal(c.start % CHUNK_ALIGN, 0);
  for (const c of plan.slice(0, -1)) assert.equal(c.length % CHUNK_ALIGN, 0);
  // 파일이 청크보다 작으면 1개
  assert.deepEqual(chunkPlan(1000, 8 * MiB), [{ start: 0, end: 999, length: 1000 }]);
  // 비정렬 청크는 내림 정렬 (300 KiB → 256 KiB)
  const p2 = chunkPlan(600 * 1024, 300 * 1024);
  assert.deepEqual(p2.map((c) => c.length), [CHUNK_ALIGN, CHUNK_ALIGN, 88 * 1024]);
  // from 오프셋부터 계획
  const p3 = chunkPlan(size, 8 * MiB, 8 * MiB);
  assert.equal(p3.length, 2);
  assert.equal(p3[0].start, 8 * MiB);
  assert.throws(() => chunkPlan(0));
  assert.throws(() => chunkPlan(100, 8 * MiB, 101));
});

test("buildMultipartCaption — multipart/related 구조", () => {
  const meta = JSON.stringify({ snippet: { videoId: "abc", language: "ko", name: "한국어", isDraft: false } });
  const srt = "1\n00:00:00,000 --> 00:00:01,000\n안녕하세요\n";
  const { body, contentType } = buildMultipartCaption(meta, srt, "BOUNDARY_x1");
  assert.equal(contentType, "multipart/related; boundary=BOUNDARY_x1");
  const text = body.toString("utf8");
  assert.equal(
    text,
    "--BOUNDARY_x1\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" +
      meta +
      "\r\n--BOUNDARY_x1\r\nContent-Type: application/octet-stream\r\n\r\n" +
      srt +
      "\r\n--BOUNDARY_x1--\r\n",
  );
  // Buffer 입력도 동일
  const b2 = buildMultipartCaption(meta, Buffer.from(srt, "utf8"), "BOUNDARY_x1");
  assert.ok(b2.body.equals(body));
  assert.throws(() => buildMultipartCaption(meta, srt, "bad boundary with spaces"));
});

test("buildInsertBody — publishAt이면 private 강제 + note", () => {
  const meta: VideoMetadata = {
    title: "제목",
    description: "설명",
    tags: ["a", "b"],
    chapters: [],
    categoryId: "27",
    language: "ko",
  };
  const plain = buildInsertBody(meta, "unlisted");
  assert.equal(plain.body.status.privacyStatus, "unlisted");
  assert.equal(plain.body.status.publishAt, undefined);
  assert.equal(plain.body.status.selfDeclaredMadeForKids, false);
  assert.equal(plain.body.snippet.defaultLanguage, "ko");
  assert.deepEqual(plain.notes, []);

  const future = new Date(Date.now() + 86_400_000).toISOString();
  const sched = buildInsertBody(meta, "public", future);
  assert.equal(sched.body.status.privacyStatus, "private");
  assert.equal(sched.body.status.publishAt, future);
  assert.equal(sched.notes.length, 1);
  assert.match(sched.notes[0], /private으로 강제/);

  assert.throws(() => buildInsertBody(meta, "private", "내일"), /ISO 8601/);
  assert.equal(buildInsertBody({ ...meta, categoryId: "" }, "private").body.snippet.categoryId, "27");
});

test("thumbnailContentType — 확장자 매핑", () => {
  assert.equal(thumbnailContentType("/x/thumbnail.png"), "image/png");
  assert.equal(thumbnailContentType("/x/thumbnail.JPG"), "image/jpeg");
  assert.equal(thumbnailContentType("/x/thumbnail.jpeg"), "image/jpeg");
  assert.equal(thumbnailContentType("/x/thumbnail.webp"), null);
});

// ── 토큰 ─────────────────────────────────────────────────────

const CREDS: UploadCredentials = { clientId: "cid", clientSecret: "sec", refreshToken: "rt" };

test("getAccessToken — 성공 + invalid_grant 안내", async () => {
  const ok = createFakeYouTube({ size: 1 });
  assert.equal(await getAccessToken(CREDS, ok.fetch), "tok-1");
  const form = new URLSearchParams(ok.calls[0].bodyText ?? "");
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), "rt");

  const bad = createFakeYouTube({ size: 1, tokenError: "invalid_grant" });
  await assert.rejects(getAccessToken(CREDS, bad.fetch), /invalid_grant.*npm run yt -- auth/);

  const down = createFakeYouTube({ size: 1, tokenError: "server_error" });
  await assert.rejects(getAccessToken(CREDS, down.fetch), /HTTP 500/);
});

// ── uploadJobVideo (임시 작업 디렉터리 + 가짜 서버) ──────────

interface Fixture {
  job: Job;
  size: number;
  sha256: string;
  cleanup: () => Promise<void>;
}

async function makeFixture(opts: { sizeBytes: number; thumbnailBytes?: number; withSrt?: boolean; metaTitle?: string }): Promise<Fixture> {
  const id = `zz-test-upload-${process.pid}-${randomBytes(3).toString("hex")}`;
  const p = jobPaths(id);
  await fs.mkdir(p.root, { recursive: true });
  const data = randomBytes(opts.sizeBytes);
  await fs.writeFile(p.finalVideo, data);
  const meta: VideoMetadata = {
    title: opts.metaTitle ?? "테스트 제목",
    description: "테스트 설명",
    tags: ["보험", "재테크"],
    chapters: [],
    categoryId: "27",
    language: "ko",
  };
  await fs.writeFile(p.metadataFile, JSON.stringify(meta));
  if (opts.thumbnailBytes !== 0) await fs.writeFile(p.thumbnailPng, randomBytes(opts.thumbnailBytes ?? 1024));
  if (opts.withSrt !== false) await fs.writeFile(p.srtFile, "1\n00:00:00,000 --> 00:00:01,000\n안녕하세요\n");
  const now = new Date().toISOString();
  const job: Job = {
    id,
    createdAt: now,
    updatedAt: now,
    topic: { title: "테스트", keywords: [], sourceUrls: [] },
    profile: {} as Job["profile"],
    stages: {} as Job["stages"],
    outputs: { videoPath: p.finalVideo },
    options: { upload: true, privacy: "private" },
  };
  return {
    job,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    cleanup: () => fs.rm(p.root, { recursive: true, force: true }),
  };
}

const noSleep = async () => {};

function run(fx: Fixture, script: ChunkBehavior[], extra: Partial<Parameters<typeof uploadJobVideo>[1]> = {}, fakeOpts: Partial<Parameters<typeof createFakeYouTube>[0]> = {}) {
  const fake = createFakeYouTube({ size: fx.size, script, ...fakeOpts });
  const progress: number[] = [];
  const logs: string[] = [];
  const promise = uploadJobVideo(fx.job, {
    privacy: "unlisted",
    credentials: CREDS,
    fetchImpl: fake.fetch,
    sleepImpl: noSleep,
    chunkSize: CHUNK_ALIGN * 4, // 1 MiB
    onProgress: (r) => progress.push(r),
    log: (l) => logs.push(l),
    ...extra,
  });
  return { fake, progress, logs, promise };
}

test("uploadJobVideo — 3청크 정상 업로드 + 썸네일/자막", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 10 + 777 }); // 2.5 MiB+ → 1 MiB 청크 3개
  try {
    const { fake, progress, promise } = run(fx, []);
    const r = await promise;
    assert.equal(r.videoId, "vid_fake_123");
    assert.equal(r.url, "https://www.youtube.com/watch?v=vid_fake_123");
    assert.deepEqual(r.notes, []);
    assert.deepEqual(fake.violations, []);
    assert.equal(fake.sessions, 1);
    assert.deepEqual(
      fake.accepted.map((a) => [a.start, a.end]),
      [
        [0, CHUNK_ALIGN * 4 - 1],
        [CHUNK_ALIGN * 4, CHUNK_ALIGN * 8 - 1],
        [CHUNK_ALIGN * 8, fx.size - 1],
      ],
    );
    assert.equal(fake.receivedSha256(), fx.sha256);
    assert.equal(progress[progress.length - 1], 1);
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i] >= progress[i - 1]);
    assert.equal(fake.thumbnail?.contentType, "image/png");
    assert.equal(fake.thumbnail?.bytes, 1024);
    assert.ok(fake.caption);
    const capText = fake.caption.body.toString("utf8");
    assert.match(capText, /"videoId":"vid_fake_123"/);
    assert.match(capText, /"language":"ko"/);
    assert.match(capText, /"name":"한국어"/);
    assert.match(capText, /application\/octet-stream\r\n\r\n1\n00:00:00,000/);
    // 초기화 요청 헤더·본문
    const init = fake.calls.find((c) => c.url.includes("uploadType=resumable"));
    assert.ok(init);
    assert.equal(init.headers["x-upload-content-length"], String(fx.size));
    const initBody = JSON.parse(init.bodyText ?? "{}") as { status: { privacyStatus: string } };
    assert.equal(initBody.status.privacyStatus, "unlisted");
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 308 Range 부분 수신 시 그 지점부터 재개", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 8 });
  try {
    const { fake, promise } = run(fx, ["partial"]);
    await promise;
    assert.deepEqual(fake.violations, []);
    // 첫 PUT은 앞 2×256KiB만 수락 → 두 번째 PUT은 512 KiB에서 시작해야 함
    const puts = fake.calls.filter((c) => c.method === "PUT" && /^bytes \d/.test(c.headers["content-range"] ?? ""));
    assert.equal(puts[0].headers["content-range"], `bytes 0-${CHUNK_ALIGN * 4 - 1}/${fx.size}`);
    assert.equal(puts[1].headers["content-range"], `bytes ${CHUNK_ALIGN * 2}-${CHUNK_ALIGN * 6 - 1}/${fx.size}`);
    assert.equal(fake.receivedSha256(), fx.sha256);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 503 후 상태 조회로 복구", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 12 });
  try {
    let slept = 0;
    const { fake, logs, promise } = run(fx, ["ok", "503-accepted", "503"], {
      sleepImpl: async () => {
        slept += 1;
      },
    });
    await promise;
    assert.deepEqual(fake.violations, []);
    assert.equal(fake.statusQueries, 2);
    assert.equal(slept, 2);
    assert.equal(fake.receivedSha256(), fx.sha256);
    assert.ok(logs.some((l) => l.includes("상태 조회")));
    // 503-accepted 뒤 상태 조회가 2 MiB 수신을 알려주므로 3번째 청크는 2 MiB에서 시작
    const puts = fake.calls.filter((c) => c.method === "PUT" && /^bytes \d/.test(c.headers["content-range"] ?? ""));
    assert.equal(puts[2].headers["content-range"], `bytes ${CHUNK_ALIGN * 8}-${fx.size - 1}/${fx.size}`);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 네트워크 오류도 상태 조회로 복구", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 5 });
  try {
    const { fake, promise } = run(fx, ["network"]);
    const r = await promise;
    assert.equal(r.videoId, "vid_fake_123");
    assert.equal(fake.statusQueries, 1);
    assert.equal(fake.receivedSha256(), fx.sha256);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 5xx 연속 초과 시 실패", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 5 });
  try {
    const { promise } = run(fx, ["503", "503", "503", "503", "503", "503", "503"]);
    await assert.rejects(promise, /서버 오류 반복/);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 404 세션 만료 → 초기화부터 1회 재시도", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 9 });
  try {
    const { fake, promise } = run(fx, ["ok", "404"]);
    const r = await promise;
    assert.equal(r.videoId, "vid_fake_123");
    assert.equal(fake.sessions, 2);
    assert.ok(r.notes.some((n) => n.includes("재초기화")));
    assert.deepEqual(fake.violations, []);
    // 두 번째 세션은 0부터 다시
    const second = fake.accepted.filter((a) => a.session === 2);
    assert.equal(second[0].start, 0);
    assert.equal(second[second.length - 1].end, fx.size - 1);
    assert.equal(fake.receivedSha256(), fx.sha256);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 404 두 번이면 실패", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN });
  try {
    const { promise } = run(fx, ["404", "404"]);
    await assert.rejects(promise, /세션 만료/);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 401이면 토큰 갱신 후 같은 청크 재전송", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN * 5 });
  try {
    const { fake, promise } = run(fx, ["ok", "401"]);
    await promise;
    assert.equal(fake.tokensIssued, 2);
    assert.deepEqual(fake.violations, []);
    assert.equal(fake.receivedSha256(), fx.sha256);
    const last = fake.calls[fake.calls.length - 1];
    assert.equal(last.headers.authorization, "Bearer tok-2");
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — invalid_grant 안내 메시지", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN });
  try {
    const { promise } = run(fx, [], {}, { tokenError: "invalid_grant" });
    await assert.rejects(promise, /토큰 만료\/철회.*npm run yt -- auth/);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 썸네일/자막 실패는 비치명(note)", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN });
  try {
    const { promise } = run(fx, [], {}, { thumbnailStatus: 403, captionStatus: 500 });
    const r = await promise;
    assert.equal(r.videoId, "vid_fake_123");
    assert.equal(r.notes.length, 2);
    assert.match(r.notes[0], /썸네일 업로드 실패 \(HTTP 403\)/);
    assert.match(r.notes[1], /자막 업로드 실패 \(HTTP 500\)/);
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — 2MB 초과 썸네일·자막 없음은 건너뜀 note", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN, thumbnailBytes: 2 * 1024 * 1024 + 1, withSrt: false });
  try {
    const { fake, promise } = run(fx, []);
    const r = await promise;
    assert.equal(fake.thumbnail, undefined);
    assert.equal(fake.caption, undefined);
    assert.ok(r.notes.some((n) => n.includes("2MB 제한")));
    assert.ok(r.notes.some((n) => n.includes("subtitles.srt 없음")));
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — publishAt + public → private 강제, 메타 정제 note", async () => {
  const longTitle = "<b>" + "가나다라 ".repeat(40);
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN, metaTitle: longTitle });
  try {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const { fake, promise } = run(fx, [], { privacy: "public", publishAt: future });
    const r = await promise;
    assert.ok(r.notes.some((n) => n.includes("private으로 강제")));
    assert.ok(r.notes.some((n) => n.includes("제목 정제")));
    const init = fake.calls.find((c) => c.url.includes("uploadType=resumable"));
    const body = JSON.parse(init?.bodyText ?? "{}") as { snippet: { title: string }; status: { privacyStatus: string; publishAt: string } };
    assert.equal(body.status.privacyStatus, "private");
    assert.equal(body.status.publishAt, future);
    assert.ok(body.snippet.title.length <= 100);
    assert.ok(!body.snippet.title.includes("<"));
  } finally {
    await fx.cleanup();
  }
});

test("uploadJobVideo — final.mp4 없으면 실패", async () => {
  const fx = await makeFixture({ sizeBytes: CHUNK_ALIGN });
  try {
    await fs.rm(fx.job.outputs.videoPath ?? "");
    const { promise } = run(fx, []);
    await assert.rejects(promise, /final\.mp4가 없습니다/);
  } finally {
    await fx.cleanup();
  }
});
