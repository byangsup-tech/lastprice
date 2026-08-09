/** 구조화 텍스트 — 번호+라벨+한 줄 설명 그리드 (시드). 글이 정답인 메시지의 정당한 형태 */
import type { FormTemplate } from "./index";
import { arr } from "./index";

interface P { items: { n?: string; t: string; d: string }[] }

export const textgrid: FormTemplate = {
  id: "textgrid",
  minParams: (p) => {
    const errs = arr(p, "items", 3, 4);
    if (Array.isArray(p.items)) {
      (p.items as { t?: string; d?: string }[]).forEach((it, i) => {
        if (!it?.t || !it?.d) errs.push(`p.items[${i}]: {t, d} 필수`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.15 : 2.95;
    const rowH = (6.2 - top) / p.items.length;
    p.items.forEach((it, i) => {
      const y = top + i * rowH;
      slide.addText(it.n ?? String(i + 1).padStart(2, "0"), { x: 1.0, y, w: 0.9, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 16, bold: true, color: c.ours, align: "left" });
      slide.addText(it.t, { x: 2.0, y, w: 9.8, h: 0.4, margin: 0, fontFace: theme.font, fontSize: 15, bold: true, color: c.ink, align: "left" });
      slide.addText(it.d, { x: 2.0, y: y + 0.42, w: 10.2, h: 0.32, margin: 0, fontFace: theme.font, fontSize: 11.5, color: c.legacy, align: "left" });
      if (i < p.items.length - 1) {
        slide.addShape("line", { x: 1.0, y: y + rowH - 0.12, w: 11.0, h: 0, line: { color: c.line, width: 0.75 } });
      }
    });
  },
};
