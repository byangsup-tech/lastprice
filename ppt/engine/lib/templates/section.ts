/** 간지 — 섹션 구분 장. 표지류(전 장 판정 제외 — 체인·형광·폼 변주 비대상) */
import type { FormTemplate } from "./index";
import { str } from "./index";

interface P { num?: string; title: string; sub?: string }

export const section: FormTemplate = {
  id: "section",
  isCover: true,
  minParams: (p) => [...str(p, "title"), ...str(p, "num", false), ...str(p, "sub", false)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    slide.background = { color: c.bg };
    if (p.num) {
      slide.addText(p.num, { x: 0.9, y: 1.9, w: 3, h: 1.1, margin: 0, fontFace: theme.font, fontSize: 64, bold: true, color: c.fn1, align: "left" });
    }
    slide.addText(p.title, { x: 0.92, y: 3.2, w: 11.4, h: 0.8, margin: 0, fontFace: theme.font, fontSize: 36, bold: true, color: c.structure, align: "left" });
    if (p.sub) {
      slide.addText(p.sub, { x: 0.95, y: 4.15, w: 11.3, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 15, color: c.legacyDark, align: "left" });
    }
    slide.addText(ctx.meta.deckLabel, { x: 0.95, y: 6.9, w: 6, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 10, color: c.mut, align: "left" });
  },
};
