import { existsSync } from "fs";
import os from "os";
import path from "path";
import { chromium, type Browser } from "playwright-core";
import { listDir } from "./fsdyn";
import type { ToolStatus } from "../types";

/**
 * Chromium(Playwright) 해석 + 브라우저 수명 관리.
 * 해석 순서: CHROMIUM_PATH → playwright-core 기본 경로(설치돼 있으면) →
 *   $PLAYWRIGHT_BROWSERS_PATH 또는 ~/.cache/ms-playwright 아래의 chromium-<rev>/chrome-linux/chrome →
 *   시스템 크롬 (/usr/bin/chromium 등)
 */

let cached: ToolStatus | null = null;

function globChromium(root: string): string | null {
  try {
    const dirs = listDir(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const d of dirs) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-linux64/chrome",
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-win/chrome.exe",
      ]) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  } catch {
    // 디렉터리 없음
  }
  return null;
}

export function resolveChromium(): ToolStatus {
  if (cached) return cached;
  const explicit = process.env.CHROMIUM_PATH?.trim();
  if (explicit && existsSync(explicit)) {
    cached = { ok: true, path: explicit };
    return cached;
  }
  // playwright-core가 아는 기본 경로 (npx playwright-core install chromium 후)
  try {
    const p = chromium.executablePath();
    if (p && existsSync(p)) {
      cached = { ok: true, path: p };
      return cached;
    }
  } catch {
    // 브라우저 미설치 — 아래 경로 탐색으로 폴백
  }
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH?.trim(),
    path.join(os.homedir(), ".cache", "ms-playwright"),
    "/opt/pw-browsers",
  ].filter((r): r is string => !!r);
  for (const root of roots) {
    const found = globChromium(root);
    if (found) {
      cached = { ok: true, path: found };
      return cached;
    }
  }
  for (const sys of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(sys)) {
      cached = { ok: true, path: sys };
      return cached;
    }
  }
  cached = {
    ok: false,
    error:
      "Chromium을 찾지 못했습니다. `npx playwright-core install chromium` 또는 CHROMIUM_PATH를 설정하세요.",
  };
  return cached;
}

export async function launchBrowser(): Promise<Browser> {
  const s = resolveChromium();
  if (!s.ok || !s.path) throw new Error(s.error ?? "Chromium 없음");
  return chromium.launch({
    executablePath: s.path,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
  });
}

/** 브라우저를 열고 fn 실행 후 반드시 닫는다 */
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await launchBrowser();
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
