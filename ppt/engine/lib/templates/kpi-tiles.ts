/** 지표 타일 — 현황 보고형 '지표' 장. 핵심 수치 2~4개 큰 타일 */
import type { FormTemplate } from "./index";
import { arr } from "./index";
import { roleColor } from "../theme";

interface Tile { label: string; value: string; delta?: string; note?: string; tone?: string }
interface P { tiles: Tile[] }

export const kpiTiles: FormTemplate = {
  id: "kpi_tiles",
  minParams: (p) => {
    const errs = arr(p, "tiles", 2, 4);
    if (Array.isArray(p.tiles)) {
      (p.tiles as Tile[]).forEach((t, i) => {
        if (!t?.label || !t?.value) errs.push(`p.tiles[${i}]: {label, value} 필수`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.1 : 2.9;
    const n = p.tiles.length;
    const gap = 0.35;
    const w = (11.9 - gap * (n - 1)) / n;
    const h = 2.6;
    p.tiles.forEach((t, i) => {
      const x = 0.72 + i * (w + gap);
      slide.addShape("roundRect", { x, y: top, w, h, rectRadius: 0.08, fill: { color: c.paper }, line: { color: c.line, width: 1 } });
      slide.addText(t.label, { x: x + 0.2, y: top + 0.22, w: w - 0.4, h: 0.3, margin: 0, fontFace: theme.font, fontSize: 11.5, bold: true, color: c.legacyDark, align: "left" });
      slide.addText(t.value, { x: x + 0.2, y: top + 0.7, w: w - 0.4, h: 0.85, margin: 0, fontFace: theme.font, fontSize: 30, bold: true, color: c.ink, align: "left", valign: "middle" });
      if (t.delta) {
        slide.addText(t.delta, { x: x + 0.2, y: top + 1.62, w: w - 0.4, h: 0.32, margin: 0, fontFace: theme.font, fontSize: 12.5, bold: true, color: t.tone ? roleColor(theme, t.tone) : c.legacyDark, align: "left" });
      }
      if (t.note) {
        slide.addText(t.note, { x: x + 0.2, y: top + h - 0.42, w: w - 0.4, h: 0.28, margin: 0, fontFace: theme.font, fontSize: 9.5, color: c.mut, align: "left" });
      }
    });
  },
};
