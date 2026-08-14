/** 실적표 — 현황 보고형 코어. 행=지표, 열=계획/실적/달성률 등. 증감 착색은 셀 tone(ok/problem/legacy)으로. */
import type { FormTemplate } from "./index";
import { str } from "./index";
import { drawTable, tableParams, type TableRow } from "../table";

interface P { cols: string[]; rows: TableRow[]; unit?: string; hiCol?: number }

export const perfTable: FormTemplate = {
  id: "perf_table",
  minParams: (p) => [...tableParams(p, 5), ...str(p, "unit", false)],
  render(ctx, spec) {
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.0 : 2.85;
    drawTable(ctx, { top, cols: p.cols, rows: p.rows, labelHead: "지표", hiCol: p.hiCol, unit: p.unit });
  },
};
