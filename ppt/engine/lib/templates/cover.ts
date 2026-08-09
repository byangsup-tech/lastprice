/** 표지 — 실물 S1 일반화 */
import type { FormTemplate } from "./index";
import { str } from "./index";

export const cover: FormTemplate = {
  id: "cover",
  isCover: true,
  minParams: (p) => [...str(p, "title"), ...str(p, "eyebrow", false), ...str(p, "subtitle", false), ...str(p, "credit", false)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as { eyebrow?: string; title: string; subtitle?: string; credit?: string };
    slide.background = { color: c.structure };
    if (p.eyebrow) {
      slide.addText(p.eyebrow, { x: 0.9, y: 2.1, w: 11, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, color: c.fn1, align: "left" });
      slide.addShape("rect", { x: 0.92, y: 2.55, w: 0.55, h: 0.045, fill: { color: c.fn1 }, line: { type: "none" } });
    }
    slide.addText(p.title, { x: 0.88, y: 2.8, w: 11.5, h: 0.95, margin: 0, fontFace: theme.font, fontSize: 46, bold: true, color: c.paper, align: "left" });
    if (p.subtitle) {
      slide.addText(p.subtitle, { x: 0.9, y: 3.85, w: 11.5, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 18, color: c.coverSub, align: "left" });
    }
    if (p.credit) {
      slide.addText(p.credit, { x: 0.9, y: 6.7, w: 6, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 11, color: c.coverCredit, align: "left" });
    }
  },
};
