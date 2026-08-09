/** 로드맵 — '다음 단계'·실행 일정 장. 기간 열 × 워크스트림 레인 + 구간 바 + 마일스톤 */
import type { FormTemplate } from "./index";
import { arr } from "./index";
import { roleColor } from "../theme";

interface Bar { from: number; to: number; label?: string; role?: string }
interface Lane { name: string; bars: Bar[] }
interface Milestone { col: number; label: string }
interface P { cols: string[]; lanes: Lane[]; milestones?: Milestone[] }

export const roadmap: FormTemplate = {
  id: "roadmap",
  minParams: (p) => {
    const errs = [...arr(p, "cols", 2, 6), ...arr(p, "lanes", 1, 4)];
    if (Array.isArray(p.cols) && Array.isArray(p.lanes)) {
      const nc = (p.cols as unknown[]).length;
      (p.lanes as Lane[]).forEach((l, i) => {
        if (!l?.name || !Array.isArray(l?.bars) || l.bars.length < 1) errs.push(`p.lanes[${i}]: {name, bars 1개 이상} 필수`);
        else l.bars.forEach((b, j) => {
          if (typeof b?.from !== "number" || typeof b?.to !== "number" || b.from > b.to || b.to >= nc) errs.push(`p.lanes[${i}].bars[${j}]: 0 ≤ from ≤ to < ${nc}`);
        });
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const top = spec.band ? 2.95 : 2.75;
    const X = 0.72, W = 11.9, nameW = 2.2;
    const colW = (W - nameW) / p.cols.length;
    const headH = 0.42;
    const laneH = Math.min(0.95, (6.05 - top - headH) / p.lanes.length);

    // 기간 열 헤더 + 세로 가이드
    p.cols.forEach((col, j) => {
      const cx = X + nameW + j * colW;
      slide.addText(col, { x: cx, y: top, w: colW, h: headH, margin: 0, fontFace: theme.font, fontSize: 11, bold: true, color: c.legacyDark, align: "center", valign: "middle" });
      slide.addShape("line", { x: cx, y: top + headH, w: 0, h: p.lanes.length * laneH, line: { color: c.line, width: 0.75 } });
    });
    slide.addShape("line", { x: X + nameW + p.cols.length * colW, y: top + headH, w: 0, h: p.lanes.length * laneH, line: { color: c.line, width: 0.75 } });

    // 레인 + 바
    p.lanes.forEach((lane, i) => {
      const y = top + headH + i * laneH;
      slide.addShape("line", { x: X, y: y + laneH, w: W, h: 0, line: { color: c.line, width: 0.5 } });
      slide.addText(lane.name, { x: X, y, w: nameW - 0.15, h: laneH, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ink, align: "left", valign: "middle" });
      lane.bars.forEach((b) => {
        const role = b.role || "fn1";
        const bg = `${role}Bg` in c ? roleColor(theme, `${role}Bg`) : c.cellBg;
        const border = roleColor(theme, role);
        const txt = `${role}Text` in c ? roleColor(theme, `${role}Text`) : border;
        const bx = X + nameW + b.from * colW + 0.06;
        const bw = (b.to - b.from + 1) * colW - 0.12;
        slide.addShape("roundRect", { x: bx, y: y + laneH / 2 - 0.21, w: bw, h: 0.42, rectRadius: 0.08, fill: { color: bg }, line: { color: border, width: 1 } });
        if (b.label) {
          slide.addText(b.label, { x: bx + 0.08, y: y + laneH / 2 - 0.21, w: bw - 0.16, h: 0.42, margin: 0, fontFace: theme.font, fontSize: 10, bold: true, color: txt, align: "center", valign: "middle" });
        }
      });
    });

    // 마일스톤 (열 경계 상단 다이아몬드)
    (p.milestones || []).forEach((m) => {
      const mx = X + nameW + m.col * colW;
      slide.addShape("diamond", { x: mx - 0.09, y: top + headH - 0.1, w: 0.18, h: 0.18, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(m.label, { x: mx - 1.0, y: top + headH + p.lanes.length * laneH + 0.06, w: 2.0, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 9.5, bold: true, color: c.structure, align: "center" });
    });
  },
};
