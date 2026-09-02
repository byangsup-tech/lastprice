import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { Scene } from "../types";
import {
  SEARCH_TTL_MS,
  fetchPhoto,
  fetchVideo,
  photoCandidates,
  photoDownloadUrl,
  pickByIndex,
  pickStockForScene,
  pickVideoFile,
  searchCacheFile,
  stockQuery,
  videoCandidates,
  type PexelsPhotoSearch,
  type PexelsVideoSearch,
  type StockDeps,
} from "./stock";

/** 실제 Pexels /v1/search 응답 형태 (필요 필드 위주) */
const PHOTOS: PexelsPhotoSearch = {
  page: 1,
  per_page: 5,
  total_results: 8000,
  photos: [
    {
      id: 3184291,
      width: 5760,
      height: 3840,
      url: "https://www.pexels.com/photo/people-doing-group-hand-cheer-3184291/",
      photographer: "fauxels",
      photographer_url: "https://www.pexels.com/@fauxels",
      src: {
        original: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg",
        large2x: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        large: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&h=650&w=940",
        landscape: "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=627&w=1200",
      },
    },
    {
      // 세로 사진 — 제외
      id: 1111,
      width: 3000,
      height: 4000,
      url: "https://www.pexels.com/photo/portrait-1111/",
      photographer: "Someone",
      src: { original: "https://images.pexels.com/photos/1111/pexels-photo-1111.jpeg" },
    },
    {
      // 너무 작음 — 제외
      id: 2222,
      width: 1600,
      height: 900,
      url: "https://www.pexels.com/photo/small-2222/",
      photographer: "Small",
      src: { original: "https://images.pexels.com/photos/2222/pexels-photo-2222.jpeg" },
    },
    {
      id: 3333,
      width: 4000,
      height: 2667,
      url: "https://www.pexels.com/photo/office-3333/",
      photographer: "Office Person",
      src: { original: "https://images.pexels.com/photos/3333/pexels-photo-3333.jpeg?x=1" },
    },
  ],
};

/** 실제 Pexels /videos/search 응답 형태 */
const VIDEOS: PexelsVideoSearch = {
  page: 1,
  per_page: 5,
  total_results: 1200,
  videos: [
    {
      id: 3195394,
      width: 3840,
      height: 2160,
      duration: 24,
      url: "https://www.pexels.com/video/people-working-3195394/",
      user: { id: 1, name: "Pressmaster", url: "https://www.pexels.com/@pressmaster" },
      video_files: [
        { id: 1, quality: "hd", file_type: "video/mp4", width: 1280, height: 720, fps: 25, link: "https://player.vimeo.com/external/1.mp4" },
        { id: 2, quality: "uhd", file_type: "video/mp4", width: 3840, height: 2160, fps: 25, link: "https://player.vimeo.com/external/2.mp4" },
        { id: 3, quality: "hd", file_type: "video/mp4", width: 2560, height: 1440, fps: 25, link: "https://player.vimeo.com/external/3.mp4" },
        { id: 4, quality: "sd", file_type: "video/mp4", width: 1920, height: 1080, fps: 25, link: "https://player.vimeo.com/external/4.mp4" },
        { id: 5, quality: "hls", file_type: "video/mp4", width: null, height: null, link: "https://player.vimeo.com/external/5.m3u8" },
        { id: 6, quality: "hd", file_type: "video/webm", width: 1920, height: 1080, link: "https://player.vimeo.com/external/6.webm" },
      ],
    },
    {
      // 1920 이상 mp4 없음 — 제외
      id: 4444,
      width: 1280,
      height: 720,
      url: "https://www.pexels.com/video/small-4444/",
      user: { name: "Tiny" },
      video_files: [{ id: 7, quality: "hd", file_type: "video/mp4", width: 1280, height: 720, link: "https://x/7.mp4" }],
    },
  ],
};

function scene(index: number, keywords: string[]): Scene {
  return { id: `s${index + 1}`, index, chapterIndex: 0, layout: "plain", narration: "나레이션", visualKeywords: keywords };
}

test("stockQuery — 키워드 공백 결합·소문자, 비어 있으면 null", () => {
  assert.equal(stockQuery(scene(0, [" Office ", "Desk"])), "office desk");
  assert.equal(stockQuery(scene(0, [])), null);
  assert.equal(stockQuery(scene(0, ["  "])), null);
});

test("photoCandidates / photoDownloadUrl — 가로 & ≥1920, 원본 + 리사이즈 파라미터", () => {
  const c = photoCandidates(PHOTOS);
  assert.deepEqual(c.map((p) => p.id), [3184291, 3333]);
  assert.equal(
    photoDownloadUrl(c[0]),
    "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=2560",
  );
  // 원본 URL 에 쿼리가 있어도 교체
  assert.equal(photoDownloadUrl(c[1]), "https://images.pexels.com/photos/3333/pexels-photo-3333.jpeg?auto=compress&cs=tinysrgb&w=2560");
});

test("pickVideoFile — mp4 & 1920..2560 중 폭 오름차순 첫 항목 (quality 무시)", () => {
  const f = pickVideoFile(VIDEOS.videos[0]);
  assert.equal(f?.id, 4);
  assert.equal(f?.width, 1920);
  assert.equal(pickVideoFile(VIDEOS.videos[1]), null);
  const c = videoCandidates(VIDEOS);
  assert.equal(c.length, 1);
  assert.equal(c[0].video.user.name, "Pressmaster");
});

test("pickByIndex — index 순환, 빈 목록은 null", () => {
  assert.equal(pickByIndex(["a", "b", "c"], 0), "a");
  assert.equal(pickByIndex(["a", "b", "c"], 4), "b");
  assert.equal(pickByIndex(["a", "b", "c"], -1), "c");
  assert.equal(pickByIndex([], 3), null);
});

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "yt-stock-"));
}

test("fetchPhoto — 검색 JSON 캐시(7일) + 파일 캐시 + 크레딧", async () => {
  const cacheDir = await tmpDir();
  const calls: string[] = [];
  const downloads: string[] = [];
  let now = 1_000_000;
  const deps: StockDeps = {
    apiKey: "KEY",
    cacheDir,
    now: () => now,
    fetchJson: async <T,>(url: string, init?: RequestInit) => {
      calls.push(url);
      const h = init?.headers as Record<string, string> | undefined;
      assert.equal(h?.authorization, "KEY");
      return PHOTOS as unknown as T;
    },
    download: async (url, dest) => {
      downloads.push(url);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, "jpeg-bytes");
    },
  };
  const a = await fetchPhoto("office desk", 0, deps);
  assert.ok(a);
  assert.equal(a.path, path.join(cacheDir, "photos", "3184291.jpg"));
  assert.deepEqual(a.credit, { by: "fauxels", url: "https://www.pexels.com/photo/people-doing-group-hand-cheer-3184291/" });
  assert.equal(calls.length, 1);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, "https://api.pexels.com/v1/search");
  assert.equal(u.searchParams.get("query"), "office desk");
  assert.equal(u.searchParams.get("per_page"), "5");
  assert.equal(u.searchParams.get("orientation"), "landscape");
  assert.equal(u.searchParams.get("size"), "large");
  assert.deepEqual(downloads, ["https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=2560"]);

  // 같은 검색어 다른 index → 두 번째 후보, 검색은 캐시에서
  const b = await fetchPhoto("office desk", 1, deps);
  assert.equal(b?.credit.by, "Office Person");
  assert.equal(calls.length, 1, "검색 캐시 사용");
  assert.equal(downloads.length, 2);

  // 같은 파일은 다시 내려받지 않음
  await fetchPhoto("office desk", 2, deps);
  assert.equal(downloads.length, 2);

  // 7일 지나면 재검색
  now += SEARCH_TTL_MS + 1;
  await fetchPhoto("office desk", 0, deps);
  assert.equal(calls.length, 2);
  assert.ok(await fs.stat(searchCacheFile("photo", "office desk", cacheDir)));
  await fs.rm(cacheDir, { recursive: true, force: true });
});

test("fetchVideo — videos 엔드포인트·size=medium·파일 선택·크레딧", async () => {
  const cacheDir = await tmpDir();
  const calls: string[] = [];
  const downloads: string[] = [];
  const deps: StockDeps = {
    apiKey: "KEY",
    cacheDir,
    fetchJson: async <T,>(url: string) => {
      calls.push(url);
      return VIDEOS as unknown as T;
    },
    download: async (url, dest) => {
      downloads.push(url);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, "mp4-bytes");
    },
  };
  const v = await fetchVideo("people working", 0, deps);
  assert.ok(v);
  assert.equal(v.path, path.join(cacheDir, "videos", "3195394.mp4"));
  assert.deepEqual(v.credit, { by: "Pressmaster", url: "https://www.pexels.com/video/people-working-3195394/" });
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, "https://api.pexels.com/videos/search");
  assert.equal(u.searchParams.get("size"), "medium");
  assert.deepEqual(downloads, ["https://player.vimeo.com/external/4.mp4"]);
  await fs.rm(cacheDir, { recursive: true, force: true });
});

test("pickStockForScene — 키 없음/키워드 없음/오류 → null (예외 없음)", async () => {
  const cacheDir = await tmpDir();
  assert.equal(await pickStockForScene(scene(0, ["office"]), "photo", { apiKey: "", cacheDir }), null);
  assert.equal(await pickStockForScene(scene(0, []), "photo", { apiKey: "KEY", cacheDir }), null);
  const failing: StockDeps = {
    apiKey: "KEY",
    cacheDir,
    fetchJson: async () => {
      throw new Error("HTTP 429");
    },
  };
  assert.equal(await pickStockForScene(scene(0, ["office"]), "photo", failing), null);
  const badDownload: StockDeps = {
    apiKey: "KEY",
    cacheDir,
    fetchJson: async <T,>() => PHOTOS as unknown as T,
    download: async () => {
      throw new Error("network");
    },
  };
  assert.equal(await pickStockForScene(scene(0, ["office"]), "photo", badDownload), null);
  // 검색 결과 없음
  const empty: StockDeps = { apiKey: "KEY", cacheDir, fetchJson: async <T,>() => ({ photos: [] }) as unknown as T };
  assert.equal(await pickStockForScene(scene(0, ["nothing"]), "photo", empty), null);
  await fs.rm(cacheDir, { recursive: true, force: true });
});
