/** 2×2 — 두 축 분류·포지셔닝 (시드). q 순서: [좌상, 우상, 좌하, 우하] */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface P { xl: string; xr: string; yb: string; yt: string; q: string[]; hi?: number }

export const matrix: FormTemplate = {
  id: "matrix",
  minParams: (p) => [...str(p, "xl"), ...str(p, "xr"), ...str(p, "yb"), ...str(p, "yt"), ...arr(p, "q", 4, 4)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const cx = 6.66;
    const cy = spec.band ? 4.6 : 4.4;
    const halfW = 3.6;
    const halfH = 1.55;
    const Q = [
      { x: cx - halfW, y: cy - halfH, tx: cx - halfW / 2, ty: cy - halfH / 2 },
      { x: cx, y: cy - halfH, tx: cx + halfW / 2, ty: cy - halfH / 2 },
      { x: cx - halfW, y: cy, tx: cx - halfW / 2, ty: cy + halfH / 2 },
      { x: cx, y: cy, tx: cx + halfW / 2, ty: cy + halfH / 2 },
    ];
    if (typeof p.hi === "number" && Q[p.hi]) {
      slide.addShape("rect", { x: Q[p.hi].x, y: Q[p.hi].y, w: halfW, h: halfH, fill: { color: c.oursBg }, line: { type: "none" } });
    }
    slide.addShape("line", { x: cx, y: cy - halfH, w: 0, h: halfH * 2, line: { color: c.legacy, width: 1 } });
    slide.addShape("line", { x: cx - halfW, y: cy, w: halfW * 2, h: 0, line: { color: c.legacy, width: 1 } });
    slide.addText(p.xl, { x: cx - halfW, y: cy + 0.04, w: 1.6, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, color: c.legacy, align: "left" });
    slide.addText(p.xr, { x: cx + halfW - 1.6, y: cy + 0.04, w: 1.6, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, color: c.legacy, align: "right" });
    slide.addText(p.yt, { x: cx + 0.08, y: cy - halfH - 0.28, w: 2.2, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, color: c.legacy, align: "left" });
    slide.addText(p.yb, { x: cx + 0.08, y: cy + halfH + 0.04, w: 2.2, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, color: c.legacy, align: "left" });
    p.q.forEach((t, i) => {
      const hot = i === p.hi;
      slide.addText(t, { x: Q[i].tx - 1.5, y: Q[i].ty - 0.15, w: 3, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 13, bold: hot, color: hot ? c.ours : c.ink, align: "center", valign: "middle" });
    });
  },
};
