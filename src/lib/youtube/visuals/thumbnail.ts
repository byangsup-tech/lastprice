import { promises as fs } from "fs";
import { fileExists, readJsonFile } from "../jobs";
import { jobPaths } from "../paths";
import { withBrowser } from "../tools/chromium";
import { ensureFonts } from "../tools/fonts";
import type { FramePlan, Job, Script } from "../types";
import { closeCardPage, openCardPage, setCardContent, templateFonts, type CreditEntry } from "./render";
import { hasStock, pickStockForScene } from "./stock";
import {
  THUMB_HEIGHT,
  THUMB_MAX_TEXT_WIDTH,
  THUMB_WIDTH,
  renderThumbnailHtml,
  splitThumbnailLines,
  thumbnailFontSize,
  type TemplateContext,
} from "./templates";

/**
 * 썸네일 단계 — 1280×720 PNG (addendum §I)
 * - 헤드라인 ≤2줄 × ≤7자, font-size = min(150, floor(1160/maxLineLen)) ≥ 96, keep-all, stroke + 그림자
 * - 렌더 후 getBoundingClientRect().width > 1160 이면 폰트 10% 축소 재렌더 (최대 3회)
 * - 배경: 첫 스톡 사진(credits.json 의 file) → 없으면 키가 있을 때 훅 장면 키워드로 검색 → 없으면 테마 그라데이션
 * - PNG 가 2 MB 를 넘으면 JPEG(quality 85) 로 다시 캡처해 thumbnail.jpg 사용
 */

export const THUMB_MAX_BYTES = 2 * 1024 * 1024;
export const SHRINK_STEPS = 3;

export interface RenderThumbnailOptions {
  plan?: FramePlan | null;
  log?: (line: string) => void;
}

/** 측정 폭이 한계를 넘을 때의 다음 폰트 크기 (10% 축소, 정수) */
export function shrinkFontSize(size: number): number {
  return Math.max(24, Math.floor(size * 0.9));
}

async function findBackground(job: Job, script: Script, log: (l: string) => void): Promise<string | undefined> {
  const p = jobPaths(job.id);
  const credits = (await readJsonFile<CreditEntry[]>(p.creditsFile)) ?? [];
  for (const c of credits) {
    if (c && c.kind === "photo" && typeof c.file === "string" && (await fileExists(c.file))) return c.file;
  }
  if (!hasStock()) return undefined;
  const hook = [...script.scenes].sort((a, b) => a.index - b.index)[0];
  if (!hook) return undefined;
  const pick = await pickStockForScene(hook, "photo");
  if (pick) log(`썸네일: 배경 스톡 사진 — ${pick.credit.by}`);
  return pick?.path;
}

export async function renderThumbnail(
  job: Job,
  script: Script,
  opts: RenderThumbnailOptions = {},
): Promise<{ path: string; bytes: number }> {
  const p = jobPaths(job.id);
  const log = opts.log ?? (() => undefined);
  await fs.mkdir(p.root, { recursive: true });

  const fonts = await ensureFonts();
  if (!fonts.ok) log(`경고: ${fonts.error ?? "한글 폰트 미확보"} — 시스템 폰트로 렌더합니다`);
  const bgImagePath = await findBackground(job, script, log);

  const ctx: TemplateContext = {
    theme: job.profile.theme,
    fonts: templateFonts(fonts),
    watermark: job.profile.brand?.watermark ?? job.profile.name,
    bgImagePath,
  };
  const headline = script.thumbnail.headline.trim() || script.title;
  const input = { headline, sub: script.thumbnail.sub, channelName: job.profile.brand?.watermark ?? job.profile.name };
  const lines = splitThumbnailLines(headline);
  let fontSize = thumbnailFontSize(lines);

  const result = await withBrowser(async (browser) => {
    const page = await openCardPage(browser, p.framesDir, { width: THUMB_WIDTH, height: THUMB_HEIGHT });
    try {
      let width = 0;
      for (let attempt = 0; attempt <= SHRINK_STEPS; attempt++) {
        await setCardContent(page, renderThumbnailHtml(input, ctx, { fontSize }));
        width = await page.evaluate(() => {
          const el = document.getElementById("headline");
          return el ? el.getBoundingClientRect().width : 0;
        });
        if (width <= THUMB_MAX_TEXT_WIDTH || attempt === SHRINK_STEPS) break;
        const next = shrinkFontSize(fontSize);
        log(`썸네일: 헤드라인 폭 ${Math.round(width)}px > ${THUMB_MAX_TEXT_WIDTH}px → 폰트 ${fontSize} → ${next}px`);
        fontSize = next;
      }
      await page.screenshot({ path: p.thumbnailPng, type: "png", fullPage: false });
      let out = p.thumbnailPng;
      let bytes = (await fs.stat(p.thumbnailPng)).size;
      if (bytes > THUMB_MAX_BYTES) {
        await page.screenshot({ path: p.thumbnailJpg, type: "jpeg", quality: 85, fullPage: false });
        const jpgBytes = (await fs.stat(p.thumbnailJpg)).size;
        log(`썸네일: PNG ${Math.round(bytes / 1024)} KB > 2 MB → JPEG ${Math.round(jpgBytes / 1024)} KB`);
        out = p.thumbnailJpg;
        bytes = jpgBytes;
      }
      return { path: out, bytes, width, fontSize, lines };
    } finally {
      await closeCardPage(page, p.framesDir);
    }
  });

  log(
    `썸네일: ${lines.join(" / ")} · ${result.fontSize}px · 폭 ${Math.round(result.width)}px → ${result.path} (${Math.round(result.bytes / 1024)} KB)`,
  );
  return { path: result.path, bytes: result.bytes };
}
