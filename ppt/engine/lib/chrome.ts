/** 슬라이드 공통 크롬 — build_v5r.js의 chrome/head/band를 Theme 기반으로 일반화 (참조 구현체 v0.1 → v0.2) */
import type pptxgen from "pptxgenjs";
import type { Theme } from "./theme";
import { roleColor } from "./theme";
import type { DeckMeta, SlideSpec, StampSpec } from "./types";

export interface SlideCtx {
  pres: pptxgen;
  slide: pptxgen.Slide;
  theme: Theme;
  num: number; // 쪽번호 (표지=1)
  meta: DeckMeta;
}

/** 본문 장 공통 영역 좌표 (LAYOUT_WIDE 13.33×7.5in) */
export const FRAME = { x: 0.36, y: 1.1, w: 12.61, h: 6.06 };
export const BODY = { x: 0.72, bandY: 2.48, topNoBand: 2.5, w: 11.9, bottom: 6.3 };

/** 배경·러닝헤더·주제 라벨·캡슐·본문 프레임·쪽번호 */
export function chrome(ctx: SlideCtx, s: SlideSpec): void {
  const { slide, theme, num, meta } = ctx;
  const c = theme.c;
  slide.background = { color: c.bg };
  slide.addText(meta.deckLabel, { x: 0.4, y: 0.1, w: 4, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 8, color: c.mut, align: "left" });
  slide.addText(s.label ?? "", { x: 0.4, y: 0.36, w: 9.6, h: 0.56, margin: 0, fontFace: theme.font, fontSize: 27, bold: true, color: c.structure, align: "left", valign: "middle" });
  if (s.pill) {
    slide.addShape("roundRect", { x: 10.3, y: 0.44, w: 2.66, h: 0.44, rectRadius: 0.22, fill: { color: c.fn1 }, line: { type: "none" } });
    slide.addText(s.pill, { x: 10.3, y: 0.44, w: 2.66, h: 0.44, margin: 0, fontFace: theme.font, fontSize: 13, bold: true, color: c.structure, align: "center", valign: "middle" });
  }
  slide.addShape("roundRect", { x: FRAME.x, y: FRAME.y, w: FRAME.w, h: FRAME.h, rectRadius: 0.06, fill: { color: c.paper }, line: { color: c.line, width: 1 } });
  slide.addText(String(num), { x: 12.55, y: 7.2, w: 0.5, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.mut, align: "right" });
}

/** 헤드메시지 층 — 좌측 바 + 형광 runs + 보조문 */
export function head(ctx: SlideCtx, s: SlideSpec): void {
  if (!s.head) return;
  const { slide, theme } = ctx;
  const c = theme.c;
  slide.addShape("rect", { x: 0.72, y: 1.36, w: 0.07, h: 0.5, fill: { color: c.structure }, line: { type: "none" } });
  const runs = s.head.runs.map((r) => ({ text: r.t, options: r.hl ? { highlight: c.hl } : {} }));
  slide.addText(runs, { x: 0.94, y: 1.3, w: 11.6, h: 0.6, margin: 0, fontFace: theme.font, fontSize: 19, bold: true, color: c.ink, align: "left", valign: "middle" });
  if (s.head.sub) {
    slide.addText(s.head.sub, { x: 0.96, y: 1.96, w: 11.5, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 13, color: c.legacyDark, align: "left", valign: "middle" });
  }
}

/** 본문 밴드 제목 (서술 라벨 — 결론은 헤드 전용, F14) */
export function band(ctx: SlideCtx, opts: { x: number; y: number; w: number; text: string; role?: string }): void {
  const { slide, theme } = ctx;
  const bg = roleColor(theme, opts.role ?? "structure");
  slide.addShape("rect", { x: opts.x, y: opts.y, w: opts.w, h: 0.4, fill: { color: bg }, line: { type: "none" } });
  slide.addText(opts.text, { x: opts.x, y: opts.y, w: opts.w, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 13, bold: true, color: theme.c.paper, align: "center", valign: "middle" });
}

/** 하단 ✕/○ 스탬프 줄 — 컨벤션 (전 장 동일 의미) */
export function stamps(ctx: SlideCtx, list: StampSpec[]): void {
  const { slide, theme } = ctx;
  const n = list.length;
  if (!n) return;
  const w = 11.7 / n;
  list.forEach((st, i) => {
    slide.addText(`${st.mark}  ${st.text}`, {
      x: 0.9 + i * (w + 0.2), y: 6.48, w, h: 0.28, margin: 0,
      fontFace: theme.font, fontSize: 12, bold: true, color: roleColor(theme, st.role), align: "left",
    });
  });
}

/** 각주 — (예시) 가정 근거 명기 위치 */
export function footnote(ctx: SlideCtx, text: string): void {
  const { slide, theme } = ctx;
  slide.addText(text, { x: 0.9, y: 6.86, w: 11.5, h: 0.2, margin: 0, fontFace: theme.font, fontSize: 8.5, color: theme.c.mut, align: "left" });
}

/** 템플릿 본문 배경판 (차트류 공용) */
export function chartPlate(ctx: SlideCtx, opts: { y: number; h: number }): void {
  const { slide, theme } = ctx;
  slide.addShape("rect", { x: BODY.x, y: opts.y, w: BODY.w, h: opts.h, fill: { color: theme.c.chartBg }, line: { color: theme.c.line, width: 0.75 } });
}
