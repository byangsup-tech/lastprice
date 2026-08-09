/** 순환 — 선순환·반복 구조 (개념 제안형 '작동 메커니즘'). 원형 배치 + 방향 화살표 */
import type { FormTemplate } from "./index";
import { arr, str } from "./index";

interface P { steps: string[]; center?: string }

export const cycle: FormTemplate = {
  id: "cycle",
  minParams: (p) => [...arr(p, "steps", 3, 5), ...str(p, "center", false)],
  render(ctx, spec) {
    const { slide, theme } = ctx;
    const c = theme.c;
    const p = spec.p as unknown as P;
    const cx = 6.66, cy = spec.band ? 4.62 : 4.42;
    const R = 1.5;
    const n = p.steps.length;
    const pos = p.steps.map((_, i) => {
      const a = (-90 + (360 / n) * i) * (Math.PI / 180);
      return { x: cx + R * 1.55 * Math.cos(a), y: cy + R * Math.sin(a), deg: (-90 + (360 / n) * i + 360) % 360 };
    });

    // 방향 화살표 (다음 단계로 — 원호 중간 지점에 접선 방향)
    for (let i = 0; i < n; i++) {
      const aMid = (-90 + (360 / n) * (i + 0.5)) * (Math.PI / 180);
      const mx = cx + R * 1.55 * Math.cos(aMid), my = cy + R * Math.sin(aMid);
      const tangentDeg = (aMid * 180) / Math.PI + 90; // 시계 방향 진행
      slide.addShape("rightArrow", { x: mx - 0.24, y: my - 0.14, w: 0.48, h: 0.28, rotate: tangentDeg, fill: { color: c.legacyBar }, line: { type: "none" } });
    }
    // 단계 상자
    pos.forEach((pt, i) => {
      slide.addShape("roundRect", { x: pt.x - 1.15, y: pt.y - 0.34, w: 2.3, h: 0.68, rectRadius: 0.1, fill: { color: c.oursBg }, line: { color: c.ours, width: 1 } });
      slide.addText(p.steps[i], { x: pt.x - 1.15, y: pt.y - 0.34, w: 2.3, h: 0.68, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.ours, align: "center", valign: "middle" });
    });
    if (p.center) {
      slide.addShape("ellipse", { x: cx - 0.8, y: cy - 0.8, w: 1.6, h: 1.6, fill: { color: c.structure }, line: { type: "none" } });
      slide.addText(p.center, { x: cx - 0.8, y: cy - 0.8, w: 1.6, h: 1.6, margin: 0, fontFace: theme.font, fontSize: 14, bold: true, color: c.paper, align: "center", valign: "middle" });
    }
  },
};
