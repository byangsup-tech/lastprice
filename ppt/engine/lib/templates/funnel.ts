/** 퍼널 — 좁아짐·전환 (시드) */
import type { FormTemplate } from "./index";
import { arr } from "./index";

interface P { stages: string[] }

export const funnel: FormTemplate = {
  id: "funnel",
  minParams: (p) => arr(p, "stages", 3, 4),
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.1 : 2.9;
    const n = p.stages.length;
    p.stages.forEach((s, i) => {
      const w = Math.max(10.6 - i * 2.3, 3.6);
      const y = top + i * 0.92;
      const last = i === n - 1;
      slide.addShape("roundRect", { x: 6.66 - w / 2, y, w, h: 0.74, rectRadius: 0.08, fill: { color: last ? c.oursBg : c.cellBg }, line: { color: last ? c.ours : c.line, width: last ? 1.2 : 0.75 } });
      slide.addText(s, { x: 6.66 - w / 2, y, w, h: 0.74, margin: 0, fontFace: theme.font, fontSize: 13, bold: last, color: last ? c.ours : c.ink, align: "center", valign: "middle" });
    });
  },
};
