/** 비교 카드 그리드 — 실물 S6 일반화: 좌우 2열 카드 대비 + 하단 검토 박스 */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";
import { band } from "../chrome";

interface Card { side: "left" | "right"; mark: string; main: string; sub?: string }
interface P {
  leftTitle: string;
  rightTitle: string;
  cards: Card[];
  darkRight?: boolean;
  reviewBox?: { title: string; text: string };
}

export const compareCards: FormTemplate = {
  id: "compare_cards",
  minParams: (p) => {
    const errs = [...str(p, "leftTitle"), ...str(p, "rightTitle"), ...arr(p, "cards", 2, 6)];
    if (Array.isArray(p.cards)) {
      const cards = p.cards as Card[];
      cards.forEach((cd, i) => {
        if (!cd?.side || !cd?.main) errs.push(`p.cards[${i}]: {side, main} 필수`);
      });
      if (!cards.some((cd) => cd.side === "left") || !cards.some((cd) => cd.side === "right")) {
        errs.push("p.cards: left·right 양쪽에 1개 이상 (비교 구조)");
      }
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    band(ctx, { x: 0.72, y: 2.5, w: 5.3, text: p.leftTitle, role: "legacyDark" });
    band(ctx, { x: 7.32, y: 2.5, w: 5.3, text: p.rightTitle, role: "ours" });
    const lefts = p.cards.filter((cd) => cd.side === "left");
    const rights = p.cards.filter((cd) => cd.side === "right");
    const cardH = 1.3;
    const draw = (cards: Card[], x: number, neg: boolean) => {
      cards.forEach((cd, i) => {
        const y = 3.16 + i * (cardH + 0.2);
        const dark = !neg && p.darkRight;
        const fill = dark ? c.structure : neg ? c.cellBg : c.oursBg;
        const main = dark ? c.paper : neg ? c.problem : c.ours;
        const sub = dark ? c.coverSub : c.legacyDark;
        slide.addShape("roundRect", { x, y, w: 4.75, h: cardH, rectRadius: 0.06, fill: { color: fill }, line: dark ? { type: "none" } : { color: c.line, width: 0.75 } });
        slide.addText(
          [
            { text: `${cd.mark}  ${cd.main}`, options: { fontSize: 13, bold: true, color: main, breakLine: true } },
            { text: cd.sub ?? "", options: { fontSize: 10.5, color: sub } },
          ],
          { x: x + 0.25, y, w: 4.25, h: cardH, margin: 0, fontFace: theme.font, align: "center", valign: "middle", lineSpacingMultiple: 1.3 },
        );
      });
    };
    draw(lefts, 1.0, true);
    draw(rights, 7.6, false);
    slide.addShape("rightArrow", { x: 6.25, y: 4.35, w: 0.55, h: 0.44, fill: { color: c.ours }, line: { type: "none" } });
    if (p.reviewBox) {
      slide.addShape("roundRect", { x: 0.72, y: 6.3, w: 11.9, h: 0.66, rectRadius: 0.05, fill: { color: c.paper }, line: { color: c.line, width: 0.75 } });
      slide.addText(
        [
          { text: p.reviewBox.title, options: { fontSize: 10.5, bold: true, color: c.structure, breakLine: true } },
          { text: p.reviewBox.text, options: { fontSize: 10, color: c.legacyDark } },
        ],
        { x: 0.95, y: 6.3, w: 11.5, h: 0.66, margin: 0, fontFace: theme.font, align: "left", valign: "middle", lineSpacingMultiple: 1.25 },
      );
    }
  },
};
