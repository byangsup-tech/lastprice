/** 허브 — 중심이 주변을 구동·공급하는 형태 (시드) */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface P { center: string; spokes: string[] }

export const hub: FormTemplate = {
  id: "hub",
  minParams: (p) => [...str(p, "center"), ...arr(p, "spokes", 3, 5)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const cx = 6.66;
    const cy = spec.band ? 4.65 : 4.45;
    const POS: Record<number, [number, number][]> = {
      3: [[cx, cy - 1.6], [cx - 3.4, cy + 1.1], [cx + 3.4, cy + 1.1]],
      4: [[cx - 2.9, cy - 1.35], [cx + 2.9, cy - 1.35], [cx - 2.9, cy + 1.35], [cx + 2.9, cy + 1.35]],
      5: [[cx, cy - 1.65], [cx - 3.6, cy - 0.55], [cx + 3.6, cy - 0.55], [cx - 2.3, cy + 1.5], [cx + 2.3, cy + 1.5]],
    };
    const pos = POS[p.spokes.length] ?? POS[3];
    p.spokes.forEach((_, i) => {
      const [sx, sy] = pos[i];
      slide.addShape("line", { x: Math.min(cx, sx), y: Math.min(cy, sy), w: Math.abs(sx - cx), h: Math.abs(sy - cy), flipH: sx < cx !== sy < cy ? false : undefined, line: { color: c.legacy, width: 1 } });
    });
    p.spokes.forEach((s, i) => {
      const [sx, sy] = pos[i];
      slide.addShape("roundRect", { x: sx - 1.25, y: sy - 0.35, w: 2.5, h: 0.7, rectRadius: 0.08, fill: { color: c.paper }, line: { color: c.line, width: 1 } });
      slide.addText(s, { x: sx - 1.25, y: sy - 0.35, w: 2.5, h: 0.7, margin: 0, fontFace: theme.font, fontSize: 12, color: c.ink, align: "center", valign: "middle" });
    });
    slide.addShape("ellipse", { x: cx - 0.85, y: cy - 0.85, w: 1.7, h: 1.7, fill: { color: c.ours }, line: { type: "none" } });
    slide.addText(p.center, { x: cx - 0.85, y: cy - 0.85, w: 1.7, h: 1.7, margin: 0, fontFace: theme.font, fontSize: 15, bold: true, color: c.paper, align: "center", valign: "middle" });
  },
};
