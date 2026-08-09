/** 비교 행 대비 — 실물 S5 일반화: 행 태그 + 기존/당사 셀 대비 */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";
import { band } from "../chrome";

interface Cell { mark: string; main: string; sub?: string }
interface Row { tag: string; tagSub?: string; left: Cell; right: Cell }
interface P { leftTitle: string; rightTitle: string; rows: Row[]; leftSummary?: string; rightSummary?: string }

const LX = 4.0;
const LW = 4.05;
const RX = 8.35;
const RW = 4.27;

export const compareRows: FormTemplate = {
  id: "compare_rows",
  minParams: (p) => {
    const errs = [...str(p, "leftTitle"), ...str(p, "rightTitle"), ...arr(p, "rows", 2, 3)];
    if (Array.isArray(p.rows)) {
      (p.rows as Row[]).forEach((r, i) => {
        if (!r?.tag || !r?.left?.main || !r?.right?.main) errs.push(`p.rows[${i}]: {tag, left.main, right.main} 필수`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    band(ctx, { x: LX, y: 2.62, w: LW, text: p.leftTitle, role: "legacyDark" });
    band(ctx, { x: RX, y: 2.62, w: RW, text: p.rightTitle, role: "ours" });
    const rowH = 1.22;
    const gap = 0.28;
    p.rows.forEach((r, i) => {
      const y = 3.4 + i * (rowH + gap);
      // 행 태그
      slide.addShape("roundRect", { x: 0.9, y: y + 0.1, w: 2.5, h: 0.5, rectRadius: 0.25, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(r.tag, { x: 0.9, y: y + 0.1, w: 2.5, h: 0.5, margin: 0, fontFace: theme.font, fontSize: 13, bold: true, color: c.paper, align: "center", valign: "middle" });
      if (r.tagSub) {
        slide.addText(r.tagSub, { x: 0.9, y: y + 0.64, w: 2.5, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 9.5, color: c.legacy, align: "center" });
      }
      // 좌(기존=문제) / 우(당사) 셀
      const cell = (x: number, w: number, cellSpec: Cell, neg: boolean) => {
        slide.addShape("rect", { x, y, w, h: rowH, fill: { color: neg ? c.problemBg : c.oursBg }, line: { color: neg ? c.problem : c.ours, width: 0.75 } });
        slide.addText(
          [
            { text: `${cellSpec.mark}  ${cellSpec.main}`, options: { fontSize: 13.5, bold: true, color: neg ? c.problem : c.ours, breakLine: true } },
            { text: cellSpec.sub ?? "", options: { fontSize: 10.5, color: c.legacyDark } },
          ],
          { x: x + 0.2, y, w: w - 0.4, h: rowH, margin: 0, fontFace: theme.font, align: "center", valign: "middle", lineSpacingMultiple: 1.3 },
        );
      };
      cell(LX, LW, r.left, true);
      cell(RX, RW, r.right, false);
    });
    if (p.leftSummary) {
      slide.addText(p.leftSummary, { x: LX, y: 6.32, w: LW, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.problem, align: "center" });
    }
    if (p.rightSummary) {
      slide.addText(p.rightSummary, { x: RX, y: 6.32, w: RW, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ours, align: "center" });
    }
  },
};
