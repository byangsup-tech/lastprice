/** 전·후 — 전환 계기로 상태가 바뀌는 형태 (시드) */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface P { before: string; after: string; trigger: string; items: string[] }

export const beforeAfter: FormTemplate = {
  id: "before_after",
  minParams: (p) => [...str(p, "before"), ...str(p, "after"), ...str(p, "trigger"), ...arr(p, "items", 3, 4)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.1 : 2.9;
    const colW = 4.4;
    const lx = 0.95;
    const rx = 7.95;
    slide.addText(p.before, { x: lx, y: top - 0.4, w: colW, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, color: c.legacy, align: "center" });
    slide.addText(p.after, { x: rx, y: top - 0.4, w: colW, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ours, align: "center" });
    const h = 0.62;
    const gap = 0.18;
    p.items.forEach((it, i) => {
      const y = top + i * (h + gap);
      slide.addShape("roundRect", { x: lx, y, w: colW, h, rectRadius: 0.06, fill: { color: c.paper }, line: { color: c.legacy, width: 0.9, dashType: "dash" } });
      slide.addText(it, { x: lx, y, w: colW, h, margin: 0, fontFace: theme.font, fontSize: 12, color: c.legacy, align: "center", valign: "middle" });
      slide.addShape("roundRect", { x: rx, y, w: colW, h, rectRadius: 0.06, fill: { color: c.oursBg }, line: { color: c.ours, width: 0.9 } });
      slide.addText(it, { x: rx, y, w: colW, h, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ours, align: "center", valign: "middle" });
    });
    const midY = top + (p.items.length * (h + gap)) / 2 - 0.3;
    slide.addText(p.trigger, { x: 5.55, y: midY - 0.32, w: 2.2, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ours, align: "center" });
    slide.addShape("rightArrow", { x: 5.75, y: midY + 0.02, w: 1.8, h: 0.38, fill: { color: c.legacyBar }, line: { type: "none" } });
  },
};
