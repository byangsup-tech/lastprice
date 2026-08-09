/** 구성비 — 100% 구성 비교 (비중·점유율). 세로 스택 2~4개 + 직접 라벨 */
import type { FormTemplate } from "./index";
import { arr } from "./index";
import { roleColor } from "../theme";

interface Part { name: string; v: number }
interface Bar { l: string; parts: Part[] }
interface P { bars: Bar[]; unit?: string; pct?: boolean }

const PART_ROLES = ["ours", "fn1", "fn2", "legacyBar", "cellBg"];

export const stacked: FormTemplate = {
  id: "stacked",
  minParams: (p) => {
    const errs = arr(p, "bars", 2, 4);
    if (Array.isArray(p.bars)) {
      (p.bars as Bar[]).forEach((b, i) => {
        if (!b?.l || !Array.isArray(b?.parts) || b.parts.length < 2 || b.parts.length > 5) errs.push(`p.bars[${i}]: {l, parts 2~5개} 필요`);
        else b.parts.forEach((pt, j) => { if (!pt?.name || typeof pt?.v !== "number") errs.push(`p.bars[${i}].parts[${j}]: {name, v(number)} 필요`); });
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const plateY = spec.band ? 2.88 : 2.6;
    chart(ctx, plateY);
    if (p.unit) slide.addText(p.unit, { x: 0.95, y: plateY + 0.12, w: 3.2, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy, align: "left" });

    const pct = p.pct !== false;
    const totals = p.bars.map((b) => b.parts.reduce((a, x) => a + x.v, 0));
    const maxT = Math.max(...totals, 1);
    const BASE = plateY + 2.85, HMAX = 2.1;
    const n = p.bars.length;
    const slot = 9.2 / n, bw = Math.min(1.2, slot * 0.5);

    p.bars.forEach((b, i) => {
      const x = 1.6 + slot * i + (slot - bw) / 2;
      const total = totals[i] || 1;
      const barH = pct ? HMAX : (HMAX * total) / maxT;
      let yCur = BASE;
      b.parts.forEach((pt, j) => {
        const h = (barH * pt.v) / total;
        yCur -= h;
        const role = PART_ROLES[j % PART_ROLES.length];
        const fill = roleColor(theme, role);
        slide.addShape("rect", { x, y: yCur, w: bw, h, fill: { color: fill }, line: { color: c.paper, width: 0.75 } });
        const dark = role === "ours";
        if (h >= 0.34) {
          slide.addText(`${pt.name} ${pct ? Math.round((pt.v / total) * 100) + "%" : pt.v}`, { x, y: yCur, w: bw, h, margin: 0, fontFace: theme.font, fontSize: 9.5, bold: true, color: dark ? c.paper : c.ink, align: "center", valign: "middle" });
        } else if (h >= 0.2) {
          slide.addText(String(pct ? Math.round((pt.v / total) * 100) + "%" : pt.v), { x, y: yCur, w: bw, h, margin: 0, fontFace: theme.font, fontSize: 8.5, color: dark ? c.paper : c.ink, align: "center", valign: "middle" });
        }
        // 직접 라벨 (범례 대체): 첫 스택의 조각명은 좌측에도 표기
        if (i === 0) {
          slide.addText(pt.name, { x: 0.55, y: yCur + h / 2 - 0.12, w: 1.0, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacyDark, align: "right" });
        }
      });
      slide.addText(b.l + (pct ? "" : ` (${total})`), { x: x - 0.5, y: BASE + 0.08, w: bw + 1.0, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, bold: true, color: c.ink, align: "center" });
    });
    slide.addShape("line", { x: 1.35, y: BASE, w: 10.0, h: 0, line: { color: c.legacyDark, width: 1 } });
  },
};

function chart(ctx: Parameters<FormTemplate["render"]>[0], y: number): void {
  const { slide, theme } = ctx;
  slide.addShape("rect", { x: 0.72, y, w: 11.9, h: 6.38 - y, fill: { color: theme.c.chartBg }, line: { color: theme.c.line, width: 0.75 } });
}
