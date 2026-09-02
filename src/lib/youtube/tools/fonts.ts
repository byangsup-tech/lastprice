import { promises as fs, existsSync } from "fs";
import path from "path";
import { FONT_CACHE_DIR } from "../paths";
import { listDir } from "./fsdyn";

/**
 * 한글 폰트 확보.
 * 1) YT_FONT_DIR — 시스템 폰트 디렉터리 (예: apt fonts-noto-cjk → /usr/share/fonts/opentype/noto, family "Noto Sans CJK KR")
 * 2) .cache/fonts/NotoSansKR-{Regular,Bold}.ttf — Google Fonts CSS API에서 TTF URL을 얻어 다운로드 (~6 MB × 2)
 * 3) 실패 시 family "sans-serif"로 폴백 (한글이 깨질 수 있음 — 경고)
 *
 * 반환한 dir은 ffmpeg subtitles 필터의 fontsdir=, family는 force_style FontName= 에 그대로 쓴다.
 */

export interface FontSet {
  ok: boolean;
  dir?: string;
  family: string;
  regularPath?: string;
  boldPath?: string;
  source: "system" | "download" | "fallback";
  error?: string;
}

/** 구형/비브라우저 UA로 요청해야 Google Fonts가 woff2 서브셋 120개 대신 단일 TTF를 준다 */
const UA = "Mozilla/5.0 (compatible; lastprice-youtube-pipeline/1.0)";

let cached: FontSet | null = null;

// 주의: 여기서는 path.join(dir, …)을 쓰지 않는다 — 동적 인자의 path.join은 Next 번들 트레이서가 프로젝트 전체를 끌어온다
function findSystemFont(dir: string): FontSet | null {
  try {
    const files = listDir(dir);
    if (!files.length) return null;
    const pick = (re: RegExp) => files.find((f) => re.test(f));
    const cjkBold = pick(/NotoSansCJK.*(Bold|-B)\.(ttc|otf|ttf)$/i) ?? pick(/NotoSansCJKkr-Bold\./i);
    const cjkReg = pick(/NotoSansCJK.*(Regular|-R)\.(ttc|otf|ttf)$/i) ?? pick(/NotoSansCJKkr-Regular\./i);
    if (cjkBold || cjkReg) {
      return {
        ok: true,
        dir,
        family: "Noto Sans CJK KR",
        regularPath: cjkReg ? `${dir}/${cjkReg}` : undefined,
        boldPath: cjkBold ? `${dir}/${cjkBold}` : undefined,
        source: "system",
      };
    }
    const krBold = pick(/NotoSansKR.*Bold\.(otf|ttf)$/i);
    const krReg = pick(/NotoSansKR.*Regular\.(otf|ttf)$/i);
    if (krBold || krReg) {
      return {
        ok: true,
        dir,
        family: "Noto Sans KR",
        regularPath: krReg ? `${dir}/${krReg}` : undefined,
        boldPath: krBold ? `${dir}/${krBold}` : undefined,
        source: "system",
      };
    }
    const nanum = pick(/NanumGothic(Bold)?\.(ttf|otf)$/i);
    if (nanum) {
      return {
        ok: true,
        dir,
        family: "NanumGothic",
        regularPath: `${dir}/${nanum}`,
        boldPath: `${dir}/${pick(/NanumGothicBold\.(ttf|otf)$/i) ?? nanum}`,
        source: "system",
      };
    }
  } catch {
    // 디렉터리 없음
  }
  return null;
}

async function fetchTtfUrl(weight: 400 | 700): Promise<string> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&display=swap`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) },
  );
  if (!css.ok) throw new Error(`Google Fonts CSS HTTP ${css.status}`);
  const text = await css.text();
  const urls = [...text.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  const ttf = urls.find((u) => /\.ttf$/i.test(u)) ?? urls.find((u) => /\.otf$/i.test(u));
  if (!ttf) throw new Error("Google Fonts CSS에서 TTF 폰트 URL을 찾지 못함 (woff2 서브셋만 반환됨)");
  return ttf;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`폰트 다운로드 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100_000) throw new Error("폰트 파일이 비정상적으로 작음");
  await fs.mkdir(FONT_CACHE_DIR, { recursive: true });
  const tmp = `${dest}.part`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, dest);
}

export async function ensureFonts(): Promise<FontSet> {
  if (cached?.ok) return cached;

  const sysDir = process.env.YT_FONT_DIR?.trim();
  if (sysDir) {
    const found = findSystemFont(sysDir);
    if (found) return (cached = found);
  }

  const regular = path.join(FONT_CACHE_DIR, "NotoSansKR-Regular.ttf");
  const bold = path.join(FONT_CACHE_DIR, "NotoSansKR-Bold.ttf");
  const errors: string[] = [];
  // 정적 경로로 개별 호출 (배열 순회는 번들 트레이서가 동적 접근으로 간주)
  if (!existsSync(regular)) {
    try {
      await download(await fetchTtfUrl(400), regular);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!existsSync(bold)) {
    try {
      await download(await fetchTtfUrl(700), bold);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (existsSync(bold) || existsSync(regular)) {
    return (cached = {
      ok: true,
      dir: FONT_CACHE_DIR,
      family: "Noto Sans KR",
      regularPath: existsSync(regular) ? regular : existsSync(bold) ? bold : undefined,
      boldPath: existsSync(bold) ? bold : existsSync(regular) ? regular : undefined,
      source: "download",
      error: errors.length ? errors.join("; ") : undefined,
    });
  }

  // 흔한 시스템 경로 시도
  for (const dir of [
    "/usr/share/fonts/opentype/noto",
    "/usr/share/fonts/truetype/noto",
    "/usr/share/fonts/truetype/nanum",
    "/System/Library/Fonts",
  ]) {
    const found = findSystemFont(dir);
    if (found) return (cached = found);
  }

  return (cached = {
    ok: false,
    family: "sans-serif",
    source: "fallback",
    error: `한글 폰트를 확보하지 못했습니다 (${errors.join("; ") || "다운로드 시도 없음"}). YT_FONT_DIR을 설정하세요.`,
  });
}

/** 상태 확인용 — 다운로드 없이 현재 상태만 */
export function fontStatusSync(): FontSet {
  if (cached) return cached;
  const sysDir = process.env.YT_FONT_DIR?.trim();
  if (sysDir) {
    const found = findSystemFont(sysDir);
    if (found) return found;
  }
  const bold = path.join(FONT_CACHE_DIR, "NotoSansKR-Bold.ttf");
  const regular = path.join(FONT_CACHE_DIR, "NotoSansKR-Regular.ttf");
  if (existsSync(bold) || existsSync(regular)) {
    return {
      ok: true,
      dir: FONT_CACHE_DIR,
      family: "Noto Sans KR",
      regularPath: existsSync(regular) ? regular : bold,
      boldPath: existsSync(bold) ? bold : regular,
      source: "download",
    };
  }
  return { ok: false, family: "sans-serif", source: "fallback", error: "폰트 미확보 (doctor 실행 시 다운로드)" };
}
