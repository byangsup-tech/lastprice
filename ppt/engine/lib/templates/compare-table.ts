/** 비교표 — 대상(계열사·상품 등)을 열로 나란히 놓는 항목별 비교. hiCol로 당사 열 강조. */
import type { FormTemplate } from "./index";
import { str } from "./index";
import { drawTable, tableParams, type TableRow } from "../table";

interface P { cols: string[]; rows: TableRow[]; unit?: string; hiCol?: number }

export const compareTable: FormTemplate = {
  id: "compare_table",
  minParams: (p) => [...tableParams(p, 6), ...str(p, "unit", false)],
  render(ctx, spec) {
    const p = spec.p as unknown as P;
    const top = spec.band ? 3.0 : 2.85;
    drawTable(ctx, { top, cols: p.cols, rows: p.rows, labelHead: "구분", hiCol: p.hiCol, unit: p.unit });
  },
};
