import type { ChannelProfile, Scene } from "../types";
import { clampText, escapeHtml } from "../util";

/**
 * 장면 카드·썸네일 HTML 템플릿 — 순수 문자열 빌더 (브라우저 의존 없음, 단위 테스트 대상).
 *
 * - 캔버스 1920×1080 (썸네일 1280×720), 모든 CSS 인라인
 * - 폰트: ensureFonts() 경로를 @font-face(file://)로 등록 — render.ts가 페이지를 file:// 원점으로 옮긴 뒤 setContent 한다
 *   (about:blank 원점에서는 크로미움이 file:// 리소스를 차단함)
 * - 안전 영역: 켄 번즈 최대 줌 1.10에서 가장자리 ~90px가 잘리고, 하단 ~280px는 자막·진행 바 영역이므로
 *   본문 텍스트는 x 120~1800, y 90~780 안에 둔다
 * - 모든 사용자 텍스트는 escapeHtml 로 이스케이프
 */

export const CARD_WIDTH = 1920;
export const CARD_HEIGHT = 1080;
export const THUMB_WIDTH = 1280;
export const THUMB_HEIGHT = 720;

/** 썸네일 헤드라인 규칙 (addendum §I) */
export const THUMB_MAX_LINE_CHARS = 7;
export const THUMB_MAX_TEXT_WIDTH = 1160;
export const THUMB_FONT_MAX = 150;
export const THUMB_FONT_MIN = 96;

export interface TemplateFonts {
  family: string;
  regularPath?: string;
  boldPath?: string;
}

export interface TemplateContext {
  theme: ChannelProfile["theme"];
  fonts: TemplateFonts;
  /** 우상단 워터마크 (profile.brand.watermark ?? profile.name) */
  watermark?: string;
  /** 배경 스톡 사진 절대 경로 — 어두운 오버레이 + 약한 블러 위에 텍스트 */
  bgImagePath?: string;
  /** 스톡 영상 위에 얹는 오버레이 — 배경 투명, 텍스트 뒤에 반투명 패널 */
  overlay?: boolean;
  /** title 카드 부제용 대본 요약 */
  script?: { title: string; chapterCount: number; estimatedMinutes: number };
  /** 챕터 카드 진행 표기용 (예: 2 / 5) */
  chapterCount?: number;
}

// ── 크기 계산 ────────────────────────────────────────────────

/**
 * 글자 수에 따른 폰트 크기 (px). budget = 사용할 수 있는 총 폭(px, 여러 줄이면 줄 수 × 폭).
 * 한글 글리프 폭 ≈ 0.95em 로 보고 len에 반비례, [min, max] 로 고정 → len 에 대해 단조 감소.
 */
export function fitFontSize(len: number, max: number, min: number, budget: number): number {
  if (!Number.isFinite(len) || len <= 0) return max;
  const raw = Math.floor(budget / (len * 0.95));
  return Math.max(min, Math.min(max, raw));
}

/** 썸네일 헤드라인을 최대 2줄로 나눈다 — 공백 우선(가운데에 가까운 공백), 없으면 ceil(len/2) */
export function splitThumbnailLines(headline: string): string[] {
  const text = headline.replace(/\s+/g, " ").trim();
  if (!text) return [""];
  if (text.length <= THUMB_MAX_LINE_CHARS) return [text];
  const spaces: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === " ") spaces.push(i);
  if (spaces.length) {
    const mid = text.length / 2;
    // 두 줄 모두 7자 이하가 되는 공백을 우선, 없으면 가운데에 가장 가까운 공백
    const fits = spaces.filter((i) => i <= THUMB_MAX_LINE_CHARS && text.length - i - 1 <= THUMB_MAX_LINE_CHARS);
    const pool = fits.length ? fits : spaces;
    const at = pool.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best), pool[0]);
    return [text.slice(0, at).trim(), text.slice(at + 1).trim()].filter(Boolean);
  }
  const at = Math.ceil(text.length / 2);
  return [text.slice(0, at), text.slice(at)];
}

/** 썸네일 헤드라인 폰트 크기 = min(150, floor(1160 / 가장 긴 줄)) 최소 96 */
export function thumbnailFontSize(lines: string[]): number {
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return Math.max(THUMB_FONT_MIN, Math.min(THUMB_FONT_MAX, Math.floor(THUMB_MAX_TEXT_WIDTH / maxLen)));
}

// ── 공통 CSS ─────────────────────────────────────────────────

function fileUrl(p: string): string {
  // 절대 경로 → file:// URL (공백·한글 등 인코딩, 슬래시 유지)
  const normalized = p.replace(/\\/g, "/");
  const encoded = normalized
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded.startsWith("/") ? "" : "/"}${encoded}`;
}

/** @font-face 선언 (regular + bold). 경로가 없으면 빈 문자열 → 폴백 스택만 사용 */
export function fontFaceCss(fonts: TemplateFonts): string {
  const family = escapeHtml(fonts.family);
  const face = (p: string | undefined, weight: number) =>
    p
      ? `@font-face{font-family:"${family}";src:url("${fileUrl(p)}");font-weight:${weight};font-style:normal;font-display:block;}`
      : "";
  return face(fonts.regularPath, 400) + face(fonts.boldPath, 700);
}

function fontStack(fonts: TemplateFonts, custom?: string): string {
  const list = [custom, fonts.family, "Noto Sans KR", "Noto Sans CJK KR", "NanumGothic", "Apple SD Gothic Neo", "Malgun Gothic", "sans-serif"]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => (s === "sans-serif" ? s : `"${escapeHtml(s)}"`));
  return [...new Set(list)].join(",");
}

/** 16진 색 → 어둡게 (비율 0..1) */
export function darken(hex: string, ratio: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - ratio))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function baseCss(ctx: TemplateContext, width: number, height: number): string {
  const { theme } = ctx;
  const bg = ctx.overlay
    ? "background:transparent;"
    : `background:linear-gradient(135deg,${theme.primary} 0%,${theme.background} 55%,${darken(theme.background, 0.35)} 100%);`;
  return `
${fontFaceCss(ctx.fonts)}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${width}px;height:${height}px;overflow:hidden;}
body{${bg}color:${theme.text};font-family:${fontStack(ctx.fonts, theme.fontFamily)};font-weight:400;
  -webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:anywhere;line-height:1.25;position:relative;}
.bg{position:absolute;left:-24px;top:-24px;width:calc(100% + 48px);height:calc(100% + 48px);object-fit:cover;object-position:center;filter:blur(2px) saturate(.9);}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,8,18,.82) 0%,rgba(4,8,18,.66) 55%,rgba(4,8,18,.5) 100%);}
.shade::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,0) 40%,rgba(0,0,0,.35) 100%);}
.glow{position:absolute;width:1100px;height:1100px;border-radius:50%;filter:blur(140px);opacity:.28;background:${theme.accent};right:-320px;top:-420px;}
.wm{position:absolute;top:52px;right:96px;font-size:30px;font-weight:700;letter-spacing:.02em;opacity:.72;color:${theme.text};}
.wm i{display:inline-block;width:14px;height:14px;border-radius:50%;background:${theme.accent};margin-right:12px;vertical-align:2px;}
.bar{display:inline-block;width:140px;height:12px;border-radius:6px;background:${theme.accent};}
.eyebrow{font-size:34px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:${theme.accent};}
.chapter-tag{position:absolute;left:120px;top:56px;font-size:30px;font-weight:700;color:${theme.text};opacity:.6;letter-spacing:.06em;}
b,strong{font-weight:700;}
`;
}

function backgroundHtml(ctx: TemplateContext): string {
  if (ctx.overlay) return "";
  if (ctx.bgImagePath) {
    // <img> 로 넣어야 waitUntil:"load" 가 배경 로딩을 기다린다 (CSS background-image 는 load 이벤트와 무관)
    return `<img class="bg" alt="" src="${escapeHtml(fileUrl(ctx.bgImagePath))}"><div class="shade"></div>`;
  }
  return `<div class="glow"></div>`;
}

function watermarkHtml(ctx: TemplateContext): string {
  const text = ctx.watermark?.trim();
  if (!text) return "";
  return `<div class="wm"><i></i>${escapeHtml(clampText(text, 24))}</div>`;
}

function document(title: string, css: string, body: string, width: number, height: number): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body style="width:${width}px;height:${height}px">${body}</body></html>`;
}

// ── 장면 레이아웃 ────────────────────────────────────────────

/** 본문 텍스트가 놓이는 안전 영역 (자막·진행 바 영역 제외) */
const CONTENT_W = CARD_WIDTH - 240; // 1680
const SAFE_TOP = 120;
const SAFE_H = 660; // 120..780

function contentWrap(ctx: TemplateContext, inner: string, extraStyle = ""): string {
  // 오버레이(스톡 영상)는 텍스트 뒤에 반투명 패널 — 하단 자막 영역과 겹치지 않게 같은 안전 영역에 둔다
  const panel = ctx.overlay
    ? `background:rgba(8,12,24,.62);border-radius:28px;padding:56px 72px;box-shadow:0 20px 60px rgba(0,0,0,.35);`
    : "";
  return `<div class="content" style="position:absolute;left:120px;top:${SAFE_TOP}px;width:${CONTENT_W}px;height:${SAFE_H}px;display:flex;flex-direction:column;justify-content:center;${panel}${extraStyle}">${inner}</div>`;
}

function chapterTag(scene: Scene): string {
  if (scene.chapterIndex < 0 || !scene.chapterTitle) return "";
  return `<div class="chapter-tag">${String(scene.chapterIndex + 1).padStart(2, "0")} · ${escapeHtml(clampText(scene.chapterTitle, 24))}</div>`;
}

function headingText(scene: Scene, fallback?: string): string {
  const h = scene.heading?.trim();
  if (h) return h;
  if (fallback?.trim()) return fallback.trim();
  return clampText(scene.narration.replace(/\s+/g, " "), 60);
}

function titleLayout(scene: Scene, ctx: TemplateContext): string {
  const headline = headingText(scene, ctx.script?.title);
  const size = fitFontSize(headline.length, 132, 72, CONTENT_W * 2);
  const subParts: string[] = [];
  if (ctx.script) {
    if (ctx.script.chapterCount > 0) subParts.push(`챕터 ${ctx.script.chapterCount}개`);
    if (ctx.script.estimatedMinutes > 0) subParts.push(`약 ${Math.max(1, Math.round(ctx.script.estimatedMinutes))}분 요약`);
  }
  const sub = subParts.join(" · ");
  return contentWrap(
    ctx,
    `<div class="eyebrow" style="margin-bottom:36px">INSIGHT</div>
<h1 style="font-size:${size}px;font-weight:700;line-height:1.18;letter-spacing:-.01em;max-width:${CONTENT_W}px;text-shadow:0 6px 24px rgba(0,0,0,.35)">${escapeHtml(headline)}</h1>
<div style="margin-top:44px"><span class="bar"></span></div>
${sub ? `<div style="margin-top:28px;font-size:44px;font-weight:400;opacity:.85">${escapeHtml(sub)}</div>` : ""}`,
  );
}

function chapterLayout(scene: Scene, ctx: TemplateContext): string {
  const no = Math.max(1, scene.chapterIndex + 1);
  const title = headingText(scene, scene.chapterTitle);
  const size = fitFontSize(title.length, 124, 72, CONTENT_W * 2);
  const progress = ctx.chapterCount && ctx.chapterCount > 0 ? `${no} / ${ctx.chapterCount}` : "";
  return contentWrap(
    ctx,
    `<div class="eyebrow" style="font-size:40px;margin-bottom:40px">CHAPTER ${String(no).padStart(2, "0")}${progress ? `<span style="margin-left:28px;opacity:.55;letter-spacing:.04em">${escapeHtml(progress)}</span>` : ""}</div>
<h1 style="font-size:${size}px;font-weight:700;line-height:1.18;letter-spacing:-.01em;text-shadow:0 6px 24px rgba(0,0,0,.35)">${escapeHtml(title)}</h1>
<div style="margin-top:48px"><span class="bar" style="width:220px"></span></div>`,
  );
}

function bulletsLayout(scene: Scene, ctx: TemplateContext): string {
  const heading = headingText(scene);
  const bullets = (scene.bullets ?? []).slice(0, 4);
  const hSize = fitFontSize(heading.length, 84, 56, CONTENT_W * 1.2);
  const longest = Math.max(1, ...bullets.map((b) => b.length));
  const bSize = fitFontSize(longest, 58, 40, CONTENT_W - 120);
  const gap = bullets.length >= 4 ? 26 : 36;
  const items = bullets
    .map(
      (b) =>
        `<li style="display:flex;align-items:flex-start;gap:28px;font-size:${bSize}px;line-height:1.3;font-weight:400"><span style="flex:none;width:22px;height:22px;border-radius:50%;background:${ctx.theme.accent};margin-top:${Math.round(bSize * 0.5 - 8)}px;box-shadow:0 0 0 8px rgba(255,255,255,.08)"></span><span>${escapeHtml(b)}</span></li>`,
    )
    .join("");
  return (
    chapterTag(scene) +
    contentWrap(
      ctx,
      `<h1 style="font-size:${hSize}px;font-weight:700;line-height:1.2;margin-bottom:${bullets.length >= 4 ? 40 : 56}px;text-shadow:0 4px 18px rgba(0,0,0,.35)">${escapeHtml(heading)}</h1>
<ul style="list-style:none;display:flex;flex-direction:column;gap:${gap}px;padding-left:8px">${items}</ul>`,
    )
  );
}

function statLayout(scene: Scene, ctx: TemplateContext): string {
  const value = scene.stat?.value?.trim() || "—";
  const label = scene.stat?.label?.trim() || "";
  const heading = scene.heading?.trim() ?? "";
  const vSize = fitFontSize(value.length, 260, 120, CONTENT_W);
  const lSize = fitFontSize(label.length, 60, 40, CONTENT_W);
  return (
    chapterTag(scene) +
    contentWrap(
      ctx,
      `${heading ? `<div class="eyebrow" style="letter-spacing:.08em;text-transform:none;margin-bottom:24px">${escapeHtml(heading)}</div>` : ""}
<div style="font-size:${vSize}px;font-weight:700;line-height:1.05;color:${ctx.theme.accent};letter-spacing:-.02em;text-shadow:0 10px 40px rgba(0,0,0,.4)">${escapeHtml(value)}</div>
${label ? `<div style="margin-top:28px;font-size:${lSize}px;font-weight:400;opacity:.9;line-height:1.3">${escapeHtml(label)}</div>` : ""}`,
    )
  );
}

function quoteLayout(scene: Scene, ctx: TemplateContext): string {
  const text = scene.quote?.text?.trim() || headingText(scene);
  const by = scene.quote?.by?.trim() ?? "";
  const size = fitFontSize(text.length, 76, 46, (CONTENT_W - 160) * 2.4);
  return (
    chapterTag(scene) +
    contentWrap(
      ctx,
      `<div style="font-size:200px;line-height:.6;color:${ctx.theme.accent};font-weight:700;margin-bottom:8px;opacity:.9">&ldquo;</div>
<div style="font-size:${size}px;font-weight:700;line-height:1.35;padding-left:80px;border-left:10px solid ${ctx.theme.accent};text-shadow:0 4px 18px rgba(0,0,0,.35)">${escapeHtml(text)}</div>
${by ? `<div style="margin-top:36px;padding-left:90px;font-size:40px;opacity:.8">&mdash; ${escapeHtml(by)}</div>` : ""}`,
    )
  );
}

function plainLayout(scene: Scene, ctx: TemplateContext): string {
  const heading = headingText(scene);
  const size = fitFontSize(heading.length, 104, 60, CONTENT_W * 2);
  const band = scene.chapterTitle
    ? `<div style="margin-top:56px;display:inline-flex;align-items:center;gap:20px;padding:18px 36px;border-radius:16px;background:rgba(255,255,255,.08);border-left:10px solid ${ctx.theme.accent};font-size:36px;opacity:.95;align-self:flex-start">${escapeHtml(clampText(scene.chapterTitle, 24))}</div>`
    : `<div style="margin-top:56px"><span class="bar"></span></div>`;
  return contentWrap(
    ctx,
    `<h1 style="font-size:${size}px;font-weight:700;line-height:1.22;letter-spacing:-.01em;text-shadow:0 6px 24px rgba(0,0,0,.35)">${escapeHtml(heading)}</h1>${band}`,
  );
}

function outroLayout(scene: Scene, ctx: TemplateContext): string {
  const heading = scene.heading?.trim() || "구독 · 좋아요 · 알림";
  const cta = scene.narration.replace(/\s+/g, " ").trim();
  const size = fitFontSize(cta.length, 60, 40, CONTENT_W * 2.2);
  const pill = (label: string, symbol: string) =>
    `<span style="display:inline-flex;align-items:center;gap:16px;padding:20px 40px;border-radius:999px;background:${ctx.theme.accent};color:${darken(ctx.theme.background, 0.2)};font-size:40px;font-weight:700"><span>${symbol}</span>${escapeHtml(label)}</span>`;
  return contentWrap(
    ctx,
    `<div class="eyebrow" style="margin-bottom:28px">THANK YOU</div>
<h1 style="font-size:88px;font-weight:700;line-height:1.15;text-shadow:0 6px 24px rgba(0,0,0,.35)">${escapeHtml(heading)}</h1>
<div style="margin-top:40px;font-size:${size}px;line-height:1.4;opacity:.9;max-width:1500px">${escapeHtml(cta)}</div>
<div style="margin-top:52px;display:flex;gap:24px">${pill("구독", "&#9654;")}${pill("좋아요", "&#10084;")}${pill("알림 설정", "&#128276;")}</div>`,
    "text-align:left",
  );
}

/** 장면 → 1920×1080 카드 HTML */
export function renderSceneHtml(scene: Scene, ctx: TemplateContext): string {
  let body: string;
  switch (scene.layout) {
    case "title":
      body = titleLayout(scene, ctx);
      break;
    case "chapter":
      body = chapterLayout(scene, ctx);
      break;
    case "bullets":
      body = scene.bullets?.length ? bulletsLayout(scene, ctx) : plainLayout(scene, ctx);
      break;
    case "stat":
      body = scene.stat ? statLayout(scene, ctx) : plainLayout(scene, ctx);
      break;
    case "quote":
      body = quoteLayout(scene, ctx);
      break;
    case "outro":
      body = outroLayout(scene, ctx);
      break;
    default:
      body = plainLayout(scene, ctx);
  }
  const css = baseCss(ctx, CARD_WIDTH, CARD_HEIGHT);
  return document(`${scene.id} ${scene.layout}`, css, backgroundHtml(ctx) + body + watermarkHtml(ctx), CARD_WIDTH, CARD_HEIGHT);
}

// ── 썸네일 ───────────────────────────────────────────────────

export interface ThumbnailInput {
  headline: string;
  sub?: string;
  channelName?: string;
}

export interface ThumbnailOptions {
  /** 측정 후 축소 재렌더용 — 미지정 시 thumbnailFontSize(lines) */
  fontSize?: number;
}

/**
 * 썸네일 1280×720 HTML — 헤드라인 최대 2줄, keep-all, 6px 어두운 stroke + 그림자.
 * #headline 은 width:max-content 라서 getBoundingClientRect().width 가 실제 텍스트 폭이 된다 (thumbnail.ts 가 1160px 초과 시 축소).
 */
export function renderThumbnailHtml(input: ThumbnailInput, ctx: TemplateContext, opts: ThumbnailOptions = {}): string {
  const lines = splitThumbnailLines(clampText(input.headline, 14));
  const fontSize = opts.fontSize ?? thumbnailFontSize(lines);
  const sub = input.sub?.trim();
  const channel = input.channelName?.trim();
  const stroke = darken(ctx.theme.background, 0.5);
  const css =
    baseCss({ ...ctx, overlay: false }, THUMB_WIDTH, THUMB_HEIGHT) +
    `
.wm{top:36px;right:48px;font-size:26px;}
.glow{width:760px;height:760px;right:-200px;top:-260px;filter:blur(110px);opacity:.35;}
.shade{background:linear-gradient(90deg,rgba(4,8,18,.72) 0%,rgba(4,8,18,.5) 60%,rgba(4,8,18,.35) 100%);}
.shade::after{background:none;}
.head{font-size:${fontSize}px;font-weight:700;line-height:1.1;letter-spacing:-.02em;white-space:pre-line;word-break:keep-all;width:max-content;max-width:none;
  color:#ffffff;-webkit-text-stroke:6px ${stroke};paint-order:stroke fill;
  filter:drop-shadow(0 10px 18px rgba(0,0,0,.6));}
.sub{margin-top:26px;font-size:56px;font-weight:700;color:${ctx.theme.accent};letter-spacing:-.01em;
  -webkit-text-stroke:4px ${stroke};paint-order:stroke fill;filter:drop-shadow(0 6px 12px rgba(0,0,0,.6));}
.badge{position:absolute;left:60px;bottom:44px;display:inline-flex;align-items:center;gap:14px;padding:12px 26px;border-radius:999px;
  background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.25);font-size:28px;font-weight:700;}
.badge i{width:14px;height:14px;border-radius:50%;background:${ctx.theme.accent};display:inline-block;}
.accent-bar{position:absolute;left:0;top:0;width:18px;height:100%;background:${ctx.theme.accent};}
`;
  const body = `${backgroundHtml({ ...ctx, overlay: false })}<div class="accent-bar"></div>
<div style="position:absolute;left:60px;top:0;height:${THUMB_HEIGHT}px;width:${THUMB_MAX_TEXT_WIDTH}px;display:flex;flex-direction:column;justify-content:center;padding-bottom:40px">
<div class="head" id="headline">${lines.map((l) => escapeHtml(l)).join("\n")}</div>
${sub ? `<div class="sub" id="sub">${escapeHtml(clampText(sub, 18))}</div>` : ""}
</div>
${channel ? `<div class="badge"><i></i>${escapeHtml(clampText(channel, 20))}</div>` : ""}`;
  return document("thumbnail", css, body, THUMB_WIDTH, THUMB_HEIGHT);
}
