import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { isValidJobId, resolveServableFile, SERVABLE_FILE_RE } from "./paths";
import { isTopicUsed, newJobId, readJsonFile, writeJsonFile } from "./jobs";

test("job id 형식 — KST 스탬프 + 해시", () => {
  const id = newJobId("실손보험 개편", new Date("2026-09-02T02:34:56Z"));
  assert.match(id, /^20260902-1134-[0-9a-z]{6}$/);
  assert.ok(isValidJobId(id));
});

test("isValidJobId — 경로 탈출 차단", () => {
  assert.equal(isValidJobId("../etc"), false);
  assert.equal(isValidJobId("a/b"), false);
  assert.equal(isValidJobId("ab"), false);
  assert.equal(isValidJobId("20260902-1134-abc123"), true);
});

test("SERVABLE_FILE_RE — 허용 목록", () => {
  for (const ok of ["final.mp4", "thumbnail.png", "frames/scene-01.png", "frames/scene-120-overlay.png", "audio/scene-07.mp3", "logs/pipeline.log"]) {
    assert.ok(SERVABLE_FILE_RE.test(ok), ok);
  }
  for (const bad of ["../job.json", "frames/../job.json", "job.json", ".lock", "frames/scene-1.png", "final.mp4/../x"]) {
    assert.equal(SERVABLE_FILE_RE.test(bad), false, bad);
  }
  assert.equal(resolveServableFile("20260902-1134-abc123", "../x"), null);
  const resolved = resolveServableFile("20260902-1134-abc123", "frames/scene-01.png");
  assert.ok(resolved && resolved.endsWith(path.join("20260902-1134-abc123", "frames", "scene-01.png")));
});

test("writeJsonFile/readJsonFile — 원자적 쓰기", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-jobs-"));
  const file = path.join(dir, "nested", "x.json");
  await writeJsonFile(file, { a: 1 });
  assert.deepEqual(await readJsonFile(file), { a: 1 });
  assert.equal(await readJsonFile(path.join(dir, "missing.json")), null);
  const entries = await fs.readdir(path.dirname(file));
  assert.deepEqual(entries, ["x.json"]);
  await fs.rm(dir, { recursive: true, force: true });
});

test("isTopicUsed — 정규화 비교", () => {
  assert.equal(isTopicUsed(["실손보험개편"], "실손 보험 개편!"), true);
  assert.equal(isTopicUsed(["실손보험개편"], "연금 개편"), false);
});
