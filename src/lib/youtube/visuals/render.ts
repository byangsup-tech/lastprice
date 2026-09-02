import { promises as fs } from "fs";
import path from "path";
import type { Browser, Page } from "playwright-core";
import { resolveVisualMode } from "../config";
import { fileExists, readJsonFile, writeJsonFile } from "../jobs";
import { jobPaths } from "../paths";
import { withBrowser } from "../tools/chromium";
import { ensureFonts } from "../tools/fonts";
import type { FramePlan, FramePlanScene, Job, KenBurns, Scene, Script, Timeline, VisualMode } from "../types";
import { hashId, sceneNo } from "../util";
import { hasStock, pickStockForScene, type StockCredit } from "./stock";
import { CARD_HEIGHT, CARD_WIDTH, renderSceneHtml, type TemplateContext, type TemplateFonts } from "./templates";

/**
 * 시각자료 단계 — 장면 카드(HTML → 크로미움 PNG) + 스톡 배경 + frames/plan.json
 *
 * - 브라우저 하나, 페이지 하나(1920×1080, deviceScaleFactor 1)로 모든 장면을 순서대로 캡처
 * - 페이지를 먼저 file:// 원점으로 옮긴 뒤 setContent → @font-face·배경 이미지 file:// 로딩 허용
 * - photos: 장면별 스톡 사진을 카드 배경으로 합성(PNG 하나). videos: 스톡 mp4 + 알파 오버레이 PNG
 * - 스톡 실패는 장면별 카드 폴백 (단계 실패 아님)
 * - 이미 있는 프레임은 건너뜀 (force 가 아니고 plan.mode 가 같을 때)
 * - durationMs 는 timeline 의 장면 길이, kenBurns 는 index 로 in→right→out→left 순환
 */

export interface RenderFramesOptions {
  mode?: Exclude<VisualMode, "auto">;
  force?: boolean;
  log?: (line: string) => void;
}

/** 크레딧 파일 항목 — compose.creditLines 가 by/url/provider 를 읽고, thumbnail 이 file 을 읽는다 */
export interface CreditEntry {
  provider: "pexels";
  by: string;
  url: string;
  kind: "photo" | "video";
  sceneId: string;
  /** 캐시된 원본 파일 (썸네일 배경용) */
  file: string;
}

export const KEN_BURNS_CYCLE: KenBurns[] = ["in", "right", "out", "left"];

export function kenBurnsForIndex(index: number): KenBurns {
  return KEN_BURNS_CYCLE[((index % 4) + 4) % 4];
}

/** 파일 시스템 경로 → file:// URL */
export function toFileUrl(p: string): string {
  const encoded = p
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}

/**
 * 카드 캡처용 페이지 — file:// 원점의 빈 문서로 이동해 둔다.
 * (about:blank 원점에서는 크로미움이 file:// 폰트·이미지를 "Not allowed to load local resource" 로 차단)
 */
export async function openCardPage(
  browser: Browser,
  originDir: string,
  size: { width: number; height: number } = { width: CARD_WIDTH, height: CARD_HEIGHT },
): Promise<Page> {
  await fs.mkdir(originDir, { recursive: true });
  const origin = path.join(originDir, ".origin.html");
  await fs.writeFile(origin, "<!doctype html><html lang=\"ko\"><head><meta charset=\"utf-8\"></head><body></body></html>");
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(toFileUrl(origin), { waitUntil: "load" });
  return page;
}

/** 컨텍스트를 닫고 원점용 임시 파일을 지운다 */
export async function closeCardPage(page: Page, originDir: string): Promise<void> {
  await page.context().close().catch(() => undefined);
  await fs.rm(path.join(originDir, ".origin.html"), { force: true }).catch(() => undefined);
}

/** HTML 을 페이지에 넣고 폰트·이미지 로딩을 기다린다 */
export async function setCardContent(page: Page, html: string): Promise<void> {
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((r) => {
          img.addEventListener("load", () => r(), { once: true });
          img.addEventListener("error", () => r(), { once: true });
        }),
      ),
    );
  });
}

export function templateFonts(f: { family: string; regularPath?: string; boldPath?: string }): TemplateFonts {
  return { family: f.family, regularPath: f.regularPath, boldPath: f.boldPath };
}

function sceneDurations(script: Script, timeline: Timeline): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of timeline.scenes) map.set(s.sceneId, Math.max(0, s.endMs - s.startMs));
  for (const scene of script.scenes) {
    if (!map.has(scene.id)) {
      throw new Error(`timeline.json에 장면 ${scene.id}이(가) 없습니다 — 음성 단계를 다시 실행하세요`);
    }
  }
  return map;
}

function planCredit(credit: StockCredit): FramePlanScene["credit"] {
  return { photographer: credit.by, url: credit.url, provider: "pexels" };
}

export async function renderFrames(
  job: Job,
  script: Script,
  timeline: Timeline,
  opts: RenderFramesOptions = {},
): Promise<FramePlan> {
  const p = jobPaths(job.id);
  const log = opts.log ?? (() => undefined);
  const force = !!opts.force;
  await fs.mkdir(p.framesDir, { recursive: true });

  let mode = opts.mode ?? resolveVisualMode(job.options.visualMode, job.profile);
  if (mode !== "cards" && !hasStock()) {
    log(`시각자료: PEXELS_API_KEY 없음 → ${mode} 대신 cards`);
    mode = "cards";
  }

  const fonts = await ensureFonts();
  if (!fonts.ok) log(`경고: ${fonts.error ?? "한글 폰트 미확보"} — 시스템 폰트로 렌더합니다 (한글이 깨질 수 있음)`);
  const durations = sceneDurations(script, timeline);
  const scenes = [...script.scenes].sort((a, b) => a.index - b.index);
  const prev = force ? null : await readJsonFile<FramePlan>(p.framePlanFile);
  const reusable = new Map<string, FramePlanScene>(
    prev && prev.mode === mode ? prev.scenes.map((s) => [s.sceneId, s]) : [],
  );
  const prevCredits = force ? [] : (await readJsonFile<CreditEntry[]>(p.creditsFile)) ?? [];
  const prevCreditBy = new Map(prevCredits.filter((c) => c && c.sceneId).map((c) => [c.sceneId, c]));

  const baseCtx: Omit<TemplateContext, "bgImagePath" | "overlay"> = {
    theme: job.profile.theme,
    fonts: templateFonts(fonts),
    watermark: job.profile.brand?.watermark ?? job.profile.name,
    script: {
      title: script.title,
      chapterCount: script.chapters.length,
      estimatedMinutes: script.estimatedMinutes,
    },
    chapterCount: script.chapters.length,
  };

  const planScenes: FramePlanScene[] = [];
  const credits: CreditEntry[] = [];
  let rendered = 0;
  let reused = 0;
  let stockCount = 0;
  const started = Date.now();

  log(`시각자료: ${scenes.length}장면, 모드 ${mode}, 폰트 ${fonts.family} (${fonts.source})`);

  await withBrowser(async (browser) => {
    const page = await openCardPage(browser, p.framesDir);
    try {
      for (const scene of scenes) {
        const label = `장면 ${sceneNo(scene.index)} (${scene.layout})`;
        const durationMs = durations.get(scene.id) ?? 0;
        const kenBurns = kenBurnsForIndex(scene.index);
        const imagePath = p.sceneFrame(scene.index);
        const overlayPath = p.sceneOverlay(scene.index);
        // 카드에 찍히는 내용 전부의 해시 — 대본을 고치면 해당 장면만 다시 렌더된다
        const contentHash = hashId(
          JSON.stringify({
            layout: scene.layout,
            heading: scene.heading,
            bullets: scene.bullets,
            stat: scene.stat,
            quote: scene.quote,
            chapterTitle: scene.chapterTitle,
            chapterIndex: scene.chapterIndex,
            visualKeywords: scene.visualKeywords,
            index: scene.index,
            title: script.title,
            chapterCount: script.chapters.length,
            estimatedMinutes: script.estimatedMinutes,
            theme: job.profile.theme,
            watermark: baseCtx.watermark,
            font: fonts.family,
            mode,
          }),
        );

        // 1) 재사용 — 같은 모드의 이전 plan 항목 + 내용 해시 일치 + 파일 존재
        const old = reusable.get(scene.id);
        if (old && old.contentHash === contentHash) {
          const ok =
            old.kind === "video"
              ? !!old.videoPath && (await fileExists(old.videoPath)) && (await fileExists(overlayPath))
              : await fileExists(imagePath);
          if (ok) {
            planScenes.push({
              ...old,
              durationMs,
              kenBurns,
              contentHash,
              imagePath: old.kind === "image" ? imagePath : undefined,
              overlayPath: old.kind === "video" ? overlayPath : undefined,
            });
            const oc = prevCreditBy.get(scene.id);
            if (oc) credits.push(oc);
            if (old.credit) stockCount++;
            reused++;
            continue;
          }
        }

        // 2) 스톡 (photos/videos) — 실패 시 카드
        let stockPhoto: { path: string; credit: StockCredit } | null = null;
        let stockVideo: { path: string; credit: StockCredit } | null = null;
        if (mode === "videos") {
          stockVideo = await pickStockForScene(scene, "video");
          if (!stockVideo) stockPhoto = await pickStockForScene(scene, "photo");
        } else if (mode === "photos") {
          stockPhoto = await pickStockForScene(scene, "photo");
        }

        const t0 = Date.now();
        if (stockVideo) {
          const html = renderSceneHtml(scene, { ...baseCtx, overlay: true });
          await setCardContent(page, html);
          await page.screenshot({ path: overlayPath, type: "png", omitBackground: true, fullPage: false });
          planScenes.push({
            sceneId: scene.id,
            kind: "video",
            contentHash,
            videoPath: stockVideo.path,
            overlayPath,
            durationMs,
            kenBurns,
            credit: planCredit(stockVideo.credit),
          });
          credits.push({ provider: "pexels", kind: "video", sceneId: scene.id, file: stockVideo.path, ...stockVideo.credit });
          stockCount++;
          log(`${label}: 스톡 영상 + 오버레이 (${Date.now() - t0}ms) — ${stockVideo.credit.by}`);
        } else {
          const html = renderSceneHtml(scene, { ...baseCtx, bgImagePath: stockPhoto?.path });
          await setCardContent(page, html);
          await page.screenshot({ path: imagePath, type: "png", fullPage: false });
          const entry: FramePlanScene = { sceneId: scene.id, kind: "image", imagePath, durationMs, kenBurns, contentHash };
          if (stockPhoto) {
            entry.credit = planCredit(stockPhoto.credit);
            credits.push({ provider: "pexels", kind: "photo", sceneId: scene.id, file: stockPhoto.path, ...stockPhoto.credit });
            stockCount++;
          }
          planScenes.push(entry);
          const note = stockPhoto ? `스톡 사진 배경 — ${stockPhoto.credit.by}` : mode === "cards" ? "카드" : "카드 (스톡 없음 → 폴백)";
          log(`${label}: ${note} (${Date.now() - t0}ms)`);
        }
        rendered++;
      }
    } finally {
      await closeCardPage(page, p.framesDir);
    }
  });

  const plan: FramePlan = { mode, scenes: planScenes };
  await writeJsonFile(p.framePlanFile, plan);
  await writeJsonFile(p.creditsFile, dedupeCredits(credits));
  log(
    `시각자료 완료: 렌더 ${rendered}, 재사용 ${reused}, 스톡 ${stockCount} · ${((Date.now() - started) / 1000).toFixed(1)}초 → ${path.relative(p.root, p.framePlanFile)}`,
  );
  return plan;
}

/** 같은 URL 크레딧은 한 번만 (장면 순서 유지) */
export function dedupeCredits(entries: CreditEntry[]): CreditEntry[] {
  const seen = new Set<string>();
  const out: CreditEntry[] = [];
  for (const e of entries) {
    const key = `${e.kind}:${e.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** 스크립트 장면 목록에서 index 로 장면 찾기 (테스트·CLI 보조) */
export function sceneByIndex(script: Script, index: number): Scene | undefined {
  return script.scenes.find((s) => s.index === index);
}
