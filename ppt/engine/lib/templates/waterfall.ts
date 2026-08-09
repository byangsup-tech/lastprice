/** 워터폴 — 증감 요인 분해 (분석 결과형 '발견'). 시작 → ±요인 → 끝 */
import type { FormTemplate } from "./index";
import { chartPlate } from "../chrome";
import { roleColor } from "../theme";

interface LV { l: string; v: number; role?: string }
interface P { start: { l: string; v: number }; deltas: LV[]; end: { l: string }; unit?: string }

export const waterfall: FormTemplate = {
  id: "waterfall",
  minParams: (p) => {
    const errs: string[] = [];
    const s = p.start as { l?: string; v?: unknown } | undefined;
    const e = p.end as { l?: string } | undefined;
    if (!s?.l || typeof s?.v !== "number") errs.push("p.start: {l, v(number)} 필수");
    if (!e?.l) errs.push("p.end: {l} 필수");
    if (!Array.isArray(p.deltas) || p.deltas.length < 1 || p.deltas.length > 6) errs.push("p.deltas: 1~6개");
    else (p.deltas as LV[]).forEach((d, i) => { if (!d?.l || typeof d?.v !== "number") errs.push(`p.deltas[${i}]: {l, v(number)} 필요`); });
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const plateY = spec.band ? 2.88 : 2.6;
    chartPlate(ctx, { y: plateY, h: 6.38 - plateY });
    if (p.unit) slide.addText(p.unit, { x: 0.95, y: plateY + 0.12, w: 3.2, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy, align: "left" });

    const total = p.start.v + p.deltas.reduce((a, d) => a + d.v, 0);
    const levels: number[] = [p.start.v];
    for (const d of p.deltas) levels.push(levels[levels.length - 1] + d.v);
    const maxV = Math.max(p.start.v, total, ...levels, 1);
    const BASE = plateY + 2.75, HMAX = 2.0;
    const Y = (v: number) => BASE - (HMAX * v) / maxV;

    const n = p.deltas.length + 2;
    const slot = 10.9 / n, bw = Math.min(0.85, slot * 0.6);
    const xAt = (i: number) => 1.35 + slot * i + (slot - bw) / 2;

    const bar = (i: number, y0: number, y1: number, color: string, label: string, value: number) => {
      const x = xAt(i);
      const yTop = Math.min(y0, y1), h = Math.max(Math.abs(y1 - y0), 0.05);
      slide.addShape("rect", { x, y: yTop, w: bw, h, fill: { color }, line: { type: "none" } });
      slide.addText(String(value), { x: x - 0.3, y: yTop - 0.26, w: bw + 0.6, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, bold: true, color, align: "center" });
      slide.addText(label, { x: x - 0.45, y: BASE + 0.08, w: bw + 0.9, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 9.5, color: c.ink, align: "center" });
    };

    bar(0, BASE, Y(p.start.v), c.legacyBar, p.start.l, p.start.v);
    p.deltas.forEach((d, i) => {
      const from = levels[i], to = levels[i + 1];
      const color = d.role ? roleColor(theme, d.role) : d.v >= 0 ? c.ours : c.legacyDark;
      bar(i + 1, Y(from), Y(to), color, d.l, d.v);
      // 연결 점선 (이전 누계 레벨)
      slide.addShape("line", { x: xAt(i) + bw, y: Y(from), w: xAt(i + 1) - xAt(i) - bw, h: 0, line: { color: c.legacyBar, width: 0.75, dashType: "dash" } });
    });
    slide.addShape("line", { x: xAt(n - 2) + bw, y: Y(total), w: xAt(n - 1) - xAt(n - 2) - bw, h: 0, line: { color: c.legacyBar, width: 0.75, dashType: "dash" } });
    bar(n - 1, BASE, Y(total), c.structure, p.end.l, total);
    slide.addShape("line", { x: 1.35, y: BASE, w: 10.9, h: 0, line: { color: c.legacyDark, width: 1 } });
  },
};
