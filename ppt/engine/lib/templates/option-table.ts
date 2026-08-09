/** 대안 비교 표 — 의사결정 요청형 '대안·평가 기준' 장. 셀 기호: ○/✕/△ 또는 짧은 텍스트 */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface OptionRow { name: string; cells: string[]; hi?: boolean }
interface P { criteria: string[]; options: OptionRow[]; note?: string }

export const optionTable: FormTemplate = {
  id: "option_table",
  minParams: (p) => {
    const errs = [...arr(p, "criteria", 2, 5), ...arr(p, "options", 2, 4), ...str(p, "note", false)];
    if (Array.isArray(p.criteria) && Array.isArray(p.options)) {
      const n = (p.criteria as unknown[]).length;
      (p.options as OptionRow[]).forEach((o, i) => {
        if (!o?.name) errs.push(`p.options[${i}].name 필수`);
        if (!Array.isArray(o?.cells) || o.cells.length !== n) errs.push(`p.options[${i}].cells: criteria 수(${n})와 일치해야 함`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 2.95 : 2.75;
    const X = 0.72, W = 11.9, nameW = 2.6;
    const colW = (W - nameW) / p.criteria.length;
    const headH = 0.5;
    const rowH = Math.min(1.0, (6.2 - top - headH) / p.options.length);

    // 헤더
    slide.addShape("rect", { x: X, y: top, w: nameW, h: headH, fill: { color: c.structure }, line: { color: c.paper, width: 0.75 } });
    slide.addText("대안", { x: X, y: top, w: nameW, h: headH, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.paper, align: "center", valign: "middle" });
    p.criteria.forEach((cr, j) => {
      const cx = X + nameW + j * colW;
      slide.addShape("rect", { x: cx, y: top, w: colW, h: headH, fill: { color: c.structure }, line: { color: c.paper, width: 0.75 } });
      slide.addText(cr, { x: cx, y: top, w: colW, h: headH, margin: 0, fontFace: theme.font, fontSize: 11.5, bold: true, color: c.paper, align: "center", valign: "middle" });
    });

    const markColor = (t: string) => (t.startsWith("○") ? c.ours : t.startsWith("✕") ? c.problem : t.startsWith("△") ? c.legacyDark : c.ink);
    p.options.forEach((o, i) => {
      const y = top + headH + i * rowH;
      const hot = !!o.hi;
      slide.addShape("rect", { x: X, y, w: nameW, h: rowH, fill: { color: hot ? c.oursBg : c.cellBg }, line: { color: c.line, width: 0.75 } });
      slide.addText(o.name, { x: X + 0.15, y, w: nameW - 0.3, h: rowH, margin: 0, fontFace: theme.font, fontSize: 12.5, bold: true, color: hot ? c.ours : c.ink, align: "left", valign: "middle" });
      o.cells.forEach((cell, j) => {
        const cx = X + nameW + j * colW;
        slide.addShape("rect", { x: cx, y, w: colW, h: rowH, fill: { color: hot ? c.oursBg : c.paper }, line: { color: c.line, width: 0.75 } });
        slide.addText(cell, { x: cx + 0.08, y, w: colW - 0.16, h: rowH, margin: 0, fontFace: theme.font, fontSize: 11.5, bold: /^[○✕△]/.test(cell), color: markColor(cell), align: "center", valign: "middle" });
      });
    });
    if (p.note) {
      slide.addText(p.note, { x: X, y: top + headH + p.options.length * rowH + 0.12, w: W, h: 0.26, margin: 0, fontFace: theme.font, fontSize: 10, color: c.legacyDark, align: "left" });
    }
  },
};
