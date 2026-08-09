/** 추세 — 시간에 따른 증감 (시드). 선은 점 사이 선분으로 그림 (참조 구현체 방식) */
import type { FormTemplate } from "./index";
import { arr } from "./index";
import { chartPlate } from "../chrome";

interface P { pts: { l: string; v: number }[]; note?: string; unit?: string }

export const trend: FormTemplate = {
  id: "trend",
  minParams: (p) => {
    const errs = arr(p, "pts", 4, 6);
    if (Array.isArray(p.pts)) {
      (p.pts as { l?: string; v?: unknown }[]).forEach((pt, i) => {
        if (!pt?.l || typeof pt?.v !== "number") errs.push(`p.pts[${i}]: {l, v(number)} 필요`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const plateY = spec.band ? 2.88 : 2.6;
    chartPlate(ctx, { y: plateY, h: 6.38 - plateY });
    if (p.unit) {
      slide.addText(p.unit, { x: 0.95, y: plateY + 0.12, w: 3.2, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy, align: "left" });
    }
    const pts = p.pts;
    const n = pts.length;
    const vs = pts.map((d) => d.v);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const span = max - min || 1;
    const baseY = plateY + 2.7;
    const chartH = 1.9;
    const X = (i: number) => 1.8 + (i * 9.9) / (n - 1);
    const Y = (v: number) => baseY - ((v - min) / span) * chartH;
    slide.addShape("line", { x: 1.35, y: baseY + 0.15, w: 10.9, h: 0, line: { color: c.legacyDark, width: 1 } });
    for (let i = 0; i < n - 1; i++) {
      const x1 = X(i);
      const y1 = Y(pts[i].v);
      const x2 = X(i + 1);
      const y2 = Y(pts[i + 1].v);
      slide.addShape("line", {
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
        flipV: y2 < y1, line: { color: c.ink, width: 1.6 },
      });
    }
    pts.forEach((d, i) => {
      const last = i === n - 1;
      const r = last ? 0.09 : 0.055;
      slide.addShape("ellipse", { x: X(i) - r, y: Y(d.v) - r, w: r * 2, h: r * 2, fill: { color: last ? c.ours : c.legacyBar }, line: { type: "none" } });
      slide.addText(String(d.v), { x: X(i) - 0.5, y: Y(d.v) - 0.34, w: 1, h: 0.2, margin: 0, fontFace: theme.font, fontSize: 9.5, bold: last, color: last ? c.ours : c.legacy, align: "center" });
      slide.addText(d.l, { x: X(i) - 0.75, y: baseY + 0.22, w: 1.5, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, color: c.ink, align: "center" });
    });
    if (p.note) {
      slide.addText(p.note, { x: X(n - 1) - 2.2, y: Y(pts[n - 1].v) - 0.62, w: 2.2, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 11.5, bold: true, color: c.ours, align: "right" });
    }
  },
};
