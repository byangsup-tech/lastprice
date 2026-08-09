/** 가입자 여정 — 실물 S4 일반화: 보장 밴드 계단 + 타임라인 노드 + 하단 스트립 */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";
import { chartPlate } from "../chrome";
import { roleColor } from "../theme";

interface Band { text: string; role: string; from: number }
interface Node { age: string; ev: string; sub?: string; chip?: string; role: string; pos?: number }
interface P { caption?: string; bands: Band[]; nodes: Node[]; strip?: string }

const X0 = 1.1;
const X1 = 12.3;

function nodeX(nodes: Node[], i: number): number {
  const n = nodes[i];
  if (typeof n.pos === "number") return X0 + (X1 - X0) * n.pos;
  return X0 + 0.6 + ((X1 - X0 - 1.2) * i) / Math.max(nodes.length - 1, 1);
}

export const journey: FormTemplate = {
  id: "journey",
  minParams: (p) => {
    const errs = [...arr(p, "bands", 1, 4), ...arr(p, "nodes", 2, 6), ...str(p, "strip", false)];
    if (Array.isArray(p.nodes)) {
      (p.nodes as Node[]).forEach((n, i) => {
        if (!n?.age || !n?.ev || !n?.role) errs.push(`p.nodes[${i}]: {age, ev, role} 필수`);
      });
    }
    if (Array.isArray(p.bands)) {
      (p.bands as Band[]).forEach((b, i) => {
        if (!b?.text || !b?.role || typeof b?.from !== "number") errs.push(`p.bands[${i}]: {text, role, from(노드 인덱스)} 필수`);
      });
    }
    return errs;
  },
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const plateY = spec.band ? 2.88 : 2.6;
    chartPlate(ctx, { y: plateY, h: 3.42 });
    if (p.caption) {
      slide.addText(p.caption, { x: X0, y: plateY + 0.18, w: 1.5, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy });
    }
    // 보장 밴드 계단 — from 노드 위치에서 우측 끝까지, 위로 갈수록 늦게 시작
    const bandBaseY = plateY + 1.2;
    p.bands.forEach((b, i) => {
      const bx = i === 0 ? X0 : nodeX(p.nodes, b.from);
      const by = bandBaseY - i * 0.4;
      const bh = i === 0 ? 0.52 : 0.36;
      const fill = roleColor(theme, `${b.role}Bg` in theme.c ? `${b.role}Bg` : b.role);
      const border = roleColor(theme, b.role);
      const textColor = `${b.role}Text` in theme.c ? roleColor(theme, `${b.role}Text`) : border;
      slide.addShape("rect", { x: bx, y: by, w: X1 - bx, h: bh, fill: { color: fill }, line: { color: border, width: 0.75 } });
      slide.addText(b.text, { x: bx + 0.15, y: by, w: Math.min(X1 - bx - 0.2, 3.8), h: bh, margin: 0, fontFace: theme.font, fontSize: i === 0 ? 11 : 10, bold: true, color: textColor, align: "left", valign: "middle" });
      if (i > 0) {
        slide.addShape("line", { x: bx, y: by, w: 0, h: bandBaseY + 0.9 - by, line: { color: c.legacyBar, width: 0.75, dashType: "dash" } });
      }
    });
    // 타임라인
    const tlY = plateY + 2.42;
    slide.addShape("line", { x: X0, y: tlY, w: X1 - X0, h: 0, line: { color: c.structure, width: 1.5 } });
    slide.addShape("triangle", { x: X1 - 0.02, y: tlY - 0.08, w: 0.16, h: 0.16, rotate: 90, fill: { color: c.structure }, line: { type: "none" } });
    p.nodes.forEach((n, i) => {
      const x = nodeX(p.nodes, i);
      const color = roleColor(theme, n.role);
      slide.addShape("ellipse", { x: x - 0.08, y: tlY - 0.08, w: 0.16, h: 0.16, fill: { color }, line: { color: c.paper, width: 1.5 } });
      slide.addText(n.age, { x: x - 0.75, y: tlY + 0.14, w: 1.5, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 11, bold: true, color: c.ink, align: "center" });
      slide.addText(n.ev, { x: x - 1.05, y: tlY + 0.38, w: 2.1, h: 0.22, margin: 0, fontFace: theme.font, fontSize: 10, bold: true, color, align: "center" });
      if (n.sub) {
        slide.addText(n.sub, { x: x - 1.35, y: tlY + 0.6, w: 2.7, h: 0.2, margin: 0, fontFace: theme.font, fontSize: 8.5, color: c.legacy, align: "center" });
      }
      if (n.chip) {
        slide.addShape("roundRect", { x: x - 0.85, y: tlY + 0.62, w: 1.7, h: 0.26, rectRadius: 0.13, fill: { color: c.paper }, line: { color, width: 0.75 } });
        slide.addText(n.chip, { x: x - 0.85, y: tlY + 0.62, w: 1.7, h: 0.26, margin: 0, fontFace: theme.font, fontSize: 8.5, bold: true, color, align: "center", valign: "middle" });
      }
    });
    if (p.strip) {
      slide.addShape("rect", { x: 0.72, y: 6.42, w: 11.9, h: 0.36, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(p.strip, { x: 0.72, y: 6.42, w: 11.9, h: 0.36, margin: 0, fontFace: theme.font, fontSize: 11, bold: true, color: c.paper, align: "center", valign: "middle" });
    }
  },
};
