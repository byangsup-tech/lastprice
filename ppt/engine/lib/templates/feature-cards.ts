/** 개요 카드 — 실물 S2 일반화: 기능 카드 2~3장 + 결합 스트립 + 대비 문장 */
import type { FormTemplate } from "./index";
import { arr } from "./index";
import { roleColor } from "../theme";

interface Card { title: string; lines: string[]; chip?: string; fn?: "fn1" | "fn2" }
interface P { cards: Card[]; joiner?: string; strip?: { lead: string; text: string }; compareLine?: string }

export const featureCards: FormTemplate = {
  id: "feature_cards",
  minParams: (p) => {
    const errs = [...arr(p, "cards", 2, 3)];
    if (Array.isArray(p.cards)) {
      (p.cards as Card[]).forEach((cd, i) => {
        if (!cd?.title) errs.push(`p.cards[${i}].title 필수`);
        if (!Array.isArray(cd?.lines) || cd.lines.length < 1) errs.push(`p.cards[${i}].lines 1개 이상`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const n = p.cards.length;
    const gap = 0.55 + (n === 2 ? 0.42 : 0.2);
    const cw = (11.9 - gap * (n - 1)) / n;
    p.cards.forEach((cd, i) => {
      const x = 0.72 + i * (cw + gap);
      const fnBg = cd.fn ? roleColor(theme, `${cd.fn}Bg`) : c.cellBg;
      const fnText = cd.fn ? roleColor(theme, `${cd.fn}Text`) : c.ink;
      slide.addShape("rect", { x, y: 2.5, w: cw, h: 0.52, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(cd.title, { x, y: 2.5, w: cw, h: 0.52, margin: 0, fontFace: theme.font, fontSize: 15, bold: true, color: c.paper, align: "center", valign: "middle" });
      slide.addShape("rect", { x, y: 3.02, w: cw, h: 1.52, fill: { color: c.paper }, line: { color: c.line, width: 0.75 } });
      const runs = cd.lines.map((ln, j) => ({
        text: ln,
        options: { fontSize: j === 0 ? 13 : 10.5, color: j === 0 ? c.ink : c.legacy, breakLine: j < cd.lines.length - 1 },
      }));
      slide.addText(runs, { x: x + 0.2, y: 3.02, w: cw - 0.4, h: 1.52, margin: 0, fontFace: theme.font, align: "center", valign: "middle", lineSpacingMultiple: 1.25 });
      if (cd.chip) {
        slide.addShape("rect", { x, y: 4.62, w: cw, h: 0.55, fill: { color: fnBg }, line: { type: "none" } });
        slide.addText(cd.chip, { x, y: 4.62, w: cw, h: 0.55, margin: 0, fontFace: theme.font, fontSize: 14, bold: true, color: fnText, align: "center", valign: "middle" });
      }
      if (p.joiner && i < n - 1) {
        slide.addText(p.joiner, { x: x + cw + (gap - 0.64) / 2, y: 3.35, w: 0.64, h: 0.7, margin: 0, fontFace: theme.font, fontSize: 34, bold: true, color: c.legacyBar, align: "center", valign: "middle" });
      }
    });
    if (p.strip) {
      slide.addShape("rect", { x: 0.72, y: 5.42, w: 11.9, h: 0.6, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(
        [
          { text: p.strip.lead, options: { bold: true } },
          { text: p.strip.text, options: {} },
        ],
        { x: 0.72, y: 5.42, w: 11.9, h: 0.6, margin: 0, fontFace: theme.font, fontSize: 13, color: c.paper, align: "center", valign: "middle" },
      );
    }
    if (p.compareLine) {
      slide.addText(p.compareLine, { x: 0.72, y: 6.28, w: 11.9, h: 0.36, margin: 0, fontFace: theme.font, fontSize: 13, bold: true, color: c.ours, align: "center", valign: "middle" });
    }
  },
};
