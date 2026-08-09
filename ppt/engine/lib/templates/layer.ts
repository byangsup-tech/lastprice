/** 레이어 — 위 요소들을 토대가 받치는 형태 (시드) */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface P { base: string; items: string[] }

export const layer: FormTemplate = {
  id: "layer",
  minParams: (p) => [...str(p, "base"), ...arr(p, "items", 3, 4)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.2 : 3.0;
    const n = p.items.length;
    const gap = 0.3;
    const w = (11.9 - gap * (n - 1)) / n;
    p.items.forEach((it, i) => {
      const x = 0.72 + i * (w + gap);
      slide.addShape("roundRect", { x, y: top, w, h: 1.3, rectRadius: 0.06, fill: { color: c.cellBg }, line: { color: c.line, width: 0.75 } });
      slide.addText(it, { x, y: top, w, h: 1.3, margin: 0, fontFace: theme.font, fontSize: 14, color: c.ink, align: "center", valign: "middle" });
    });
    slide.addShape("roundRect", { x: 0.72, y: top + 1.7, w: 11.9, h: 0.9, rectRadius: 0.06, fill: { color: c.ours }, line: { type: "none" } });
    slide.addText(p.base, { x: 0.72, y: top + 1.7, w: 11.9, h: 0.9, margin: 0, fontFace: theme.font, fontSize: 16, bold: true, color: c.paper, align: "center", valign: "middle" });
  },
};
