/** 공용 표 그리드 — perf_table·compare_table이 공유 (후속 판정표도 재사용 예정).
 *  헤더행 = structure 밴드, 라벨열 + 데이터 셀. 색은 전부 role 경유 — 셀 tone, hi 행/열 강조. */
import type { SlideCtx } from "./chrome";
import { roleColor } from "./theme";

export interface TableCellObj { t: string; tone?: string }
export type TableCell = string | TableCellObj;
export interface TableRow { l: string; sub?: string; cells: TableCell[]; hi?: boolean }

export interface TableOpts {
  top: number;
  cols: string[];
  rows: TableRow[];
  /** 좌상단 헤더 라벨 (실적표 "지표", 비교표 "구분") */
  labelHead: string;
  /** 강조 열 인덱스 (비교표의 당사 열 등) — 헤더 ours 채움 + 열 셀 oursBg */
  hiCol?: number;
  /** 우상단 단위 라벨 (예: "단위: 억원") — 차트 규정 '축·단위 명기'의 표 대응 */
  unit?: string;
}

const cellOf = (c: TableCell): TableCellObj => (typeof c === "string" ? { t: c } : c);

/** ○/✕/△ 선두 기호는 option_table과 동일 착색 관례 */
const markTone = (t: string): string | null =>
  t.startsWith("○") ? "ours" : t.startsWith("✕") ? "problem" : t.startsWith("△") ? "legacyDark" : null;

export function drawTable(ctx: SlideCtx, o: TableOpts): number {
  const { slide, theme } = ctx;
  const c = theme.c;
  const X = 0.72, W = 11.9, labelW = 2.6;
  const colW = (W - labelW) / o.cols.length;
  const headH = 0.5;
  const rowH = Math.min(0.9, (6.2 - o.top - headH) / o.rows.length);

  if (o.unit) {
    slide.addText(o.unit, { x: X, y: o.top - 0.3, w: W, h: 0.24, margin: 0, fontFace: theme.font, fontSize: 9.5, color: c.legacyDark, align: "right" });
  }

  // 헤더행
  slide.addShape("rect", { x: X, y: o.top, w: labelW, h: headH, fill: { color: c.structure }, line: { color: c.paper, width: 0.75 } });
  slide.addText(o.labelHead, { x: X, y: o.top, w: labelW, h: headH, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: c.paper, align: "center", valign: "middle" });
  o.cols.forEach((col, j) => {
    const cx = X + labelW + j * colW;
    const hot = j === o.hiCol;
    slide.addShape("rect", { x: cx, y: o.top, w: colW, h: headH, fill: { color: hot ? c.ours : c.structure }, line: { color: c.paper, width: 0.75 } });
    slide.addText(col, { x: cx, y: o.top, w: colW, h: headH, margin: 0, fontFace: theme.font, fontSize: 11.5, bold: true, color: c.paper, align: "center", valign: "middle" });
  });

  // 데이터 행
  o.rows.forEach((row, i) => {
    const y = o.top + headH + i * rowH;
    const rowHot = !!row.hi;
    slide.addShape("rect", { x: X, y, w: labelW, h: rowH, fill: { color: rowHot ? c.oursBg : c.cellBg }, line: { color: c.line, width: 0.75 } });
    if (row.sub) {
      slide.addText(row.l, { x: X + 0.15, y: y + 0.06, w: labelW - 0.3, h: rowH * 0.5, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: rowHot ? c.ours : c.ink, align: "left", valign: "middle" });
      slide.addText(row.sub, { x: X + 0.15, y: y + rowH * 0.52, w: labelW - 0.3, h: rowH * 0.42, margin: 0, fontFace: theme.font, fontSize: 9, color: c.legacy, align: "left", valign: "top" });
    } else {
      slide.addText(row.l, { x: X + 0.15, y, w: labelW - 0.3, h: rowH, margin: 0, fontFace: theme.font, fontSize: 12, bold: true, color: rowHot ? c.ours : c.ink, align: "left", valign: "middle" });
    }
    row.cells.forEach((cellRaw, j) => {
      const cell = cellOf(cellRaw);
      const cx = X + labelW + j * colW;
      const colHot = j === o.hiCol;
      slide.addShape("rect", { x: cx, y, w: colW, h: rowH, fill: { color: rowHot || colHot ? c.oursBg : c.paper }, line: { color: c.line, width: 0.75 } });
      const tone = cell.tone ?? markTone(cell.t);
      slide.addText(cell.t, {
        x: cx + 0.08, y, w: colW - 0.16, h: rowH, margin: 0, fontFace: theme.font, fontSize: 11.5,
        bold: !!tone, color: tone ? roleColor(theme, tone) : c.ink, align: "center", valign: "middle",
      });
    });
  });

  return o.top + headH + o.rows.length * rowH;
}

/** 두 표 템플릿 공통 minParams — cols·rows 형태 + cells 열 수 일치 */
export function tableParams(p: Record<string, unknown>, colMax: number): string[] {
  const errs: string[] = [];
  const cols = p.cols as unknown[];
  const rows = p.rows as TableRow[];
  if (!Array.isArray(cols) || cols.length < 2 || cols.length > colMax) errs.push(`p.cols: 배열 2~${colMax}개 필요`);
  if (!Array.isArray(rows) || rows.length < 2 || rows.length > 7) errs.push("p.rows: 배열 2~7개 필요");
  if (Array.isArray(cols) && Array.isArray(rows)) {
    rows.forEach((r, i) => {
      if (!r?.l) errs.push(`p.rows[${i}].l 필수`);
      if (!Array.isArray(r?.cells) || r.cells.length !== cols.length) errs.push(`p.rows[${i}].cells: cols 수(${cols.length})와 일치해야 함`);
      else r.cells.forEach((cell, j) => {
        const t = typeof cell === "string" ? cell : cell?.t;
        if (typeof t !== "string" || !t) errs.push(`p.rows[${i}].cells[${j}]: string 또는 {t} 필요`);
      });
    });
  }
  if (p.hiCol != null && (typeof p.hiCol !== "number" || !Array.isArray(cols) || p.hiCol < 0 || p.hiCol >= cols.length)) {
    errs.push("p.hiCol: cols 범위 내 인덱스여야 함");
  }
  return errs;
}
