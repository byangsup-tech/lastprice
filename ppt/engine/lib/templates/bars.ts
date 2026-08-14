/** 막대 비교 — 두 모드: grouped(계열 2개 대비, 실물 S3) / simple(단일 계열, 폼 스터디 시드) */
import type { FormTemplate } from "./index";
import { chartPlate } from "../chrome";
import { roleColor } from "../theme";

interface Series { label: string; role: string }
interface Group { l: string; tag?: string; vs: number[] }
interface P {
  unit?: string;
  series?: Series[];
  groups?: Group[];
  items?: { l: string; v: number }[];
  hi?: number;
  baseline?: { v: number; label: string };
  callout?: { text: string; at?: number };
  emphasisBox?: { at: number };
  finalTag?: { text: string; role: string };
  /** 범례 스와치 (v0.3.2 옵트인) — 계열 3개 이상이면 자동. 켜면 첫 그룹 직접 라벨을 대체 (룰북 §6 차트 규정) */
  legend?: boolean;
  /** 전 계열 값 라벨 (v0.3.2 옵트인) — 기본은 마지막 계열(당사)만 */
  dataLabels?: boolean;
}

export const bars: FormTemplate = {
  id: "bars",
  minParams: (p) => {
    const grouped = Array.isArray(p.series) && Array.isArray(p.groups);
    const simple = Array.isArray(p.items);
    if (!grouped && !simple) return ["p.items(단일 계열) 또는 p.series+p.groups(대비) 필요"];
    if (grouped) {
      const errs: string[] = [];
      const s = p.series as Series[];
      const g = p.groups as Group[];
      if (s.length < 2 || s.length > 3) errs.push("p.series: 2~3개");
      if (g.length < 2 || g.length > 6) errs.push("p.groups: 2~6개");
      g.forEach((gr, i) => {
        if (!Array.isArray(gr?.vs) || gr.vs.length !== s.length) errs.push(`p.groups[${i}].vs: 계열 수(${s.length})와 일치해야 함`);
      });
      return errs;
    }
    const items = p.items as unknown[];
    if (items.length < 2 || items.length > 6) return ["p.items: 2~6개"];
    return (items as { l?: string; v?: unknown }[]).flatMap((it, i) =>
      typeof it?.v === "number" && it?.l ? [] : [`p.items[${i}]: {l, v(number)} 필요`],
    );
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const plateY = spec.band ? 2.88 : 2.6;
    const plateH = 6.38 - plateY;
    chartPlate(ctx, { y: plateY, h: plateH });
    if (p.unit) {
      slide.addText(p.unit, { x: 0.95, y: plateY + 0.12, w: 3.2, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy, align: "left" });
    }
    const BASE = plateY + 2.67;
    const HMAX = 1.88;

    if (p.series && p.groups) {
      const maxV = Math.max(...p.groups.flatMap((g) => g.vs), p.baseline?.v ?? 0, 1);
      const n = p.groups.length;
      const slot = 10.9 / n;
      const useLegend = p.legend ?? p.series.length >= 3;
      if (useLegend) {
        // 범례 스와치 (실물 백포트) — 우상단, 계열 순서대로
        let lx = 12.35;
        [...p.series].reverse().forEach((s) => {
          const lw = s.label.length * 0.135 + 0.3;
          lx -= lw;
          slide.addText(s.label, { x: lx, y: plateY + 0.12, w: lw, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 8.5, color: c.legacyDark, align: "left" });
          lx -= 0.2;
          slide.addShape("rect", { x: lx, y: plateY + 0.15, w: 0.16, h: 0.16, fill: { color: roleColor(theme, s.role) }, line: { type: "none" } });
          lx -= 0.14;
        });
      }
      if (p.baseline) {
        const by = BASE - (HMAX * p.baseline.v) / maxV;
        slide.addShape("line", { x: 1.35, y: by, w: 10.9, h: 0, line: { color: c.legacyBar, width: 0.75, dashType: "dash" } });
        slide.addText(p.baseline.label, { x: 1.4, y: by - 0.24, w: 1.6, h: 0.2, margin: 0, fontFace: theme.font, fontSize: 8, color: c.mut });
      }
      p.groups.forEach((g, i) => {
        const cx = 1.35 + slot * i + slot / 2;
        const bw = 0.62;
        const totalW = bw * g.vs.length + 0.06 * (g.vs.length - 1);
        g.vs.forEach((v, si) => {
          const bh = (HMAX * v) / maxV;
          const bx = cx - totalW / 2 + si * (bw + 0.06);
          const color = roleColor(theme, p.series![si].role);
          slide.addShape("rect", { x: bx, y: BASE - bh, w: bw, h: bh, fill: { color }, line: { type: "none" } });
          // 직접 라벨 (범례 대체, V5): 첫 그룹 막대 위에 계열명 — 범례를 켜면 생략
          if (i === 0 && !useLegend) {
            slide.addText(p.series![si].label, { x: bx - 0.45, y: BASE - bh - 0.5, w: bw + 0.9, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 8.5, color: c.legacyDark, align: "center" });
          }
          // 전 계열 값 라벨 (v0.3.2 옵트인) — 당사 외 계열은 막대 위 작은 라벨
          if (p.dataLabels && si !== g.vs.length - 1) {
            slide.addText(String(v), { x: bx - 0.2, y: BASE - bh - 0.24, w: bw + 0.4, h: 0.2, margin: 0, fontFace: theme.font, fontSize: 8.5, color: c.legacyDark, align: "center" });
          }
          // 마지막 계열(당사)에 값 라벨
          if (si === g.vs.length - 1) {
            slide.addText(String(v), { x: bx, y: BASE - 0.28, w: bw, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, bold: true, color: c.paper, align: "center" });
            if (g.tag) {
              slide.addText(g.tag, { x: bx - 0.14, y: BASE - bh - 0.26, w: 0.9, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9.5, bold: true, color: roleColor(theme, p.series![si].role), align: "center" });
            }
          }
        });
        const hot = i === p.hi;
        slide.addText(g.l, { x: cx - 0.75, y: BASE + 0.08, w: 1.5, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, bold: hot, color: c.ink, align: "center" });
      });
      slide.addShape("line", { x: 1.35, y: BASE, w: 10.9, h: 0, line: { color: c.legacyDark, width: 1 } });
      if (p.finalTag) {
        slide.addText(p.finalTag.text, { x: 9.4, y: BASE + 0.35, w: 3.1, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 10.5, bold: true, color: roleColor(theme, p.finalTag.role), align: "center" });
      }
    } else if (p.items) {
      const items = p.items;
      const maxV = Math.max(...items.map((d) => d.v), 1);
      const slot = 10.9 / items.length;
      items.forEach((d, i) => {
        const bh = Math.max((HMAX * d.v) / maxV, 0.06);
        const bw = Math.min(0.7, slot * 0.5);
        const bx = 1.35 + slot * i + (slot - bw) / 2;
        const hot = i === (p.hi ?? 0);
        slide.addShape("rect", { x: bx, y: BASE - bh, w: bw, h: bh, fill: { color: hot ? c.ours : c.legacyBar }, line: { type: "none" } });
        slide.addText(String(d.v), { x: bx - 0.3, y: BASE - bh - 0.26, w: bw + 0.6, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, bold: hot, color: hot ? c.ours : c.legacy, align: "center" });
        slide.addText(d.l, { x: bx - 0.45, y: BASE + 0.08, w: bw + 0.9, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, color: c.ink, align: "center" });
      });
      slide.addShape("line", { x: 1.35, y: BASE, w: 10.9, h: 0, line: { color: c.legacyDark, width: 1 } });
    }

    // 주석 레이어 — 차트당 1곳 (V2: callout·emphasisBox 동시 금지는 validate가 차단)
    if (p.emphasisBox) {
      // 강조 박스 (실물 백포트) — 대상 슬롯을 problem색 점선 라운드 박스로 감쌈 (라벨 포함)
      const nSlots = p.groups?.length ?? p.items?.length ?? 0;
      const at = Math.min(Math.max(p.emphasisBox.at, 0), Math.max(nSlots - 1, 0));
      const slot = 10.9 / Math.max(nSlots, 1);
      slide.addShape("roundRect", {
        x: 1.35 + slot * at + 0.06, y: BASE - HMAX - 0.34, w: slot - 0.12, h: HMAX + 0.94,
        rectRadius: 0.06, fill: { type: "none" }, line: { color: c.problem, width: 1.25, dashType: "dash" },
      });
    }
    if (p.callout) {
      const cw = Math.min(4.2, p.callout.text.length * 0.115 + 0.6);
      const cx0 = 4.6;
      slide.addShape("roundRect", { x: cx0, y: plateY + 0.1, w: cw, h: 0.46, rectRadius: 0.1, fill: { color: c.calloutBg }, line: { color: c.calloutBorder, width: 1 } });
      slide.addText(p.callout.text, { x: cx0, y: plateY + 0.1, w: cw, h: 0.46, margin: 0, fontFace: theme.font, fontSize: 10.5, bold: true, color: c.ink, align: "center", valign: "middle" });
      slide.addShape("triangle", { x: cx0 + 0.35, y: plateY + 0.55, w: 0.22, h: 0.15, rotate: 180, fill: { color: c.calloutBg }, line: { color: c.calloutBorder, width: 1 } });
    }
  },
};
