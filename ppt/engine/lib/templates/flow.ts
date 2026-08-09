/** 플로우 — 단계·순서 (시드) */
import type { FormTemplate } from "./index";
import { arr } from "./index";

interface P { steps: string[]; hi?: number }

export const flow: FormTemplate = {
  id: "flow",
  minParams: (p) => arr(p, "steps", 3, 5),
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 4.0 : 3.8;
    const n = p.steps.length;
    const gap = 0.55;
    const w = (11.9 - gap * (n - 1)) / n;
    p.steps.forEach((s, i) => {
      const x = 0.72 + i * (w + gap);
      const hot = i === p.hi;
      slide.addShape("roundRect", { x, y: top, w, h: 1.1, rectRadius: 0.08, fill: { color: hot ? c.oursBg : c.cellBg }, line: { color: hot ? c.ours : c.line, width: hot ? 1.2 : 0.75 } });
      slide.addText(s, { x, y: top, w, h: 1.1, margin: 0, fontFace: theme.font, fontSize: 13, bold: hot, color: hot ? c.ours : c.ink, align: "center", valign: "middle" });
      if (i < n - 1) {
        slide.addShape("rightArrow", { x: x + w + 0.08, y: top + 0.4, w: gap - 0.16, h: 0.3, fill: { color: c.legacyBar }, line: { type: "none" } });
      }
    });
  },
};
