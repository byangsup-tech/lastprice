/** 데이터 반입 — decks/<덱>/data/*.tsv|csv를 deck-spec의 p로 주입. 사용: npm run deck:data -- decks/<덱>
 *
 *  원칙 (룰북 §9, v0.3.1):
 *  - 도구는 계산(파생 열·비율)만 하고 수치를 창작하지 않는다 — 값은 전부 데이터 파일에서 온다
 *  - 반입된 장은 source(출처·기준일)가 기록되고 assumed가 해제된다 — 실데이터는 가정치가 아님
 *  - 각주는 "* 자료: <label>, <asOf> 기준"으로 자동 생성 (금지 기호 없음 — 문체 규정 준수)
 *  - 멱등: 같은 데이터로 재실행하면 스펙 diff 0. 반복 보고 = data 교체 → deck:data → deck:build
 *
 *  파일 규약:
 *  - data/<테이블>.tsv|csv — 1행=헤더, 1열=행 라벨(기본). 엑셀에서 범위 복사 → 텍스트로 저장하면 TSV
 *  - data/sources.json — { "<테이블>": { "label": "출처 표기", "asOf": "2026-07", "unit"?: "억원" } }
 *  - data.map.json — { "maps": [ { slideId, table, template, ...템플릿별 바인딩 } ] }
 *
 *  템플릿별 바인딩 (지원 5종):
 *  - perf_table·compare_table: cols(사용할 열 이름·순서, 파생 열 포함), labelCol?(기본 1열), sub?(부연 열),
 *      derive?({새열: {ratio: [분자열, 분모열], fmt: "pct0"}}), tone?({col, okAt?, problemBelow?}),
 *      hiRow?(강조할 행 라벨), hiCol?(강조 열 인덱스), unit?(단위 라벨 — 생략 시 sources unit로 생성)
 *  - kpi_tiles: 열 이름 고정 label·value·delta?·note?·tone? — 행당 타일 1개
 *  - bars: labelCol?·valueCol(필수)·hiLabel?(강조 행 라벨)·unit?
 *  - trend: labelCol?·valueCol(필수)·note?
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import type { DeckSpec, SlideSpec } from "./lib/types";

interface SourceInfo { label: string; asOf?: string; unit?: string }
interface ToneRule { col: string; okAt?: number; problemBelow?: number }
interface MapEntry {
  slideId: string;
  table: string;
  template: string;
  cols?: string[];
  labelCol?: string;
  sub?: string;
  derive?: Record<string, { ratio: [string, string]; fmt?: string }>;
  tone?: ToneRule;
  hiRow?: string;
  hiCol?: number;
  unit?: string;
  valueCol?: string;
  hiLabel?: string;
  note?: string;
}

interface Table { headers: string[]; rows: string[][] }

function parseDelimited(text: string, delim: string): Table {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  const parseLine =
    delim === "\t"
      ? (l: string) => l.split("\t").map((c) => c.trim())
      : (l: string) => {
          // CSV 최소 구현 — 따옴표 필드·이중 따옴표 이스케이프만
          const out: string[] = [];
          let cur = "", inQ = false;
          for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (inQ) {
              if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
              else cur += ch;
            } else if (ch === '"') inQ = true;
            else if (ch === ",") { out.push(cur.trim()); cur = ""; }
            else cur += ch;
          }
          out.push(cur.trim());
          return out;
        };
  const grid = lines.map(parseLine);
  return { headers: grid[0], rows: grid.slice(1) };
}

function loadTable(deckDir: string, name: string): { table: Table; file: string } {
  for (const ext of ["tsv", "csv"]) {
    const rel = `data/${name}.${ext}`;
    const p = join(deckDir, rel);
    if (existsSync(p)) return { table: parseDelimited(readFileSync(p, "utf-8"), ext === "tsv" ? "\t" : ","), file: rel };
  }
  throw new Error(`data/${name}.tsv|csv 없음`);
}

/** "1,240건" · "113%" · "84.5" → 숫자 (첫 수치 토큰). 못 찾으면 null */
function num(s: string): number | null {
  const m = String(s).replace(/[,\s]/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function colIndex(t: Table, name: string): number {
  const i = t.headers.indexOf(name);
  if (i < 0) throw new Error(`열 "${name}" 없음 (헤더: ${t.headers.join(", ")})`);
  return i;
}

function fmtVal(v: number, fmt?: string): string {
  if (fmt === "pct0") return `${Math.round(v * 100)}%`;
  if (fmt === "pct1") return `${(v * 100).toFixed(1)}%`;
  return String(Math.round(v * 100) / 100);
}

type Cell = string | { t: string; tone?: string };

function bindTable(m: MapEntry, t: Table): Record<string, unknown> {
  const labelIdx = m.labelCol ? colIndex(t, m.labelCol) : 0;
  const subIdx = m.sub ? colIndex(t, m.sub) : null;
  const cols = m.cols ?? t.headers.filter((_, i) => i !== labelIdx && i !== subIdx);
  const rows = t.rows.map((r) => {
    const cells: Cell[] = cols.map((cn) => {
      const d = m.derive?.[cn];
      let text: string;
      if (d) {
        const a = num(r[colIndex(t, d.ratio[0])] ?? "");
        const b = num(r[colIndex(t, d.ratio[1])] ?? "");
        if (a == null || b == null || b === 0) throw new Error(`파생 열 "${cn}": ${d.ratio.join("/")} 수치 해석 실패 (행 "${r[labelIdx]}")`);
        text = fmtVal(a / b, d.fmt);
      } else {
        text = r[colIndex(t, cn)] ?? "";
      }
      if (m.tone && m.tone.col === cn) {
        const v = num(text);
        if (v != null) {
          if (m.tone.okAt != null && v >= m.tone.okAt) return { t: text, tone: "ok" };
          if (m.tone.problemBelow != null && v < m.tone.problemBelow) return { t: text, tone: "problem" };
        }
      }
      return text;
    });
    const row: Record<string, unknown> = { l: r[labelIdx], cells };
    if (subIdx != null && r[subIdx]) row.sub = r[subIdx];
    if (m.hiRow && r[labelIdx] === m.hiRow) row.hi = true;
    return row;
  });
  const p: Record<string, unknown> = { cols, rows };
  if (m.hiCol != null) p.hiCol = m.hiCol;
  if (m.unit) p.unit = m.unit;
  return p;
}

function bindKpi(m: MapEntry, t: Table): Record<string, unknown> {
  const li = colIndex(t, "label"), vi = colIndex(t, "value");
  const gi = (name: string) => (t.headers.includes(name) ? t.headers.indexOf(name) : null);
  const di = gi("delta"), ni = gi("note"), ti = gi("tone");
  return {
    tiles: t.rows.map((r) => {
      const tile: Record<string, unknown> = { label: r[li], value: r[vi] };
      if (di != null && r[di]) tile.delta = r[di];
      if (ni != null && r[ni]) tile.note = r[ni];
      if (ti != null && r[ti]) tile.tone = r[ti];
      return tile;
    }),
  };
}

function bindSeries(m: MapEntry, t: Table, key: "items" | "pts"): Record<string, unknown> {
  if (!m.valueCol) throw new Error("valueCol 필수 (수치 열 이름)");
  const li = m.labelCol ? colIndex(t, m.labelCol) : 0;
  const vi = colIndex(t, m.valueCol);
  const arr = t.rows.map((r) => {
    const v = num(r[vi] ?? "");
    if (v == null) throw new Error(`"${m.valueCol}" 수치 해석 실패 (행 "${r[li]}")`);
    return { l: r[li], v };
  });
  const p: Record<string, unknown> = { [key]: arr };
  if (key === "items" && m.hiLabel) {
    const hi = arr.findIndex((x) => x.l === m.hiLabel);
    if (hi >= 0) p.hi = hi;
  }
  if (m.unit) p.unit = m.unit;
  if (m.note) p.note = m.note;
  return p;
}

export function importData(deckDir: string): { applied: { slideId: string; table: string; template: string; rows: number }[] } {
  const specPath = join(deckDir, "deck-spec.json");
  const mapPath = join(deckDir, "data.map.json");
  const srcPath = join(deckDir, "data", "sources.json");
  const spec = JSON.parse(readFileSync(specPath, "utf-8")) as DeckSpec;
  const maps = (JSON.parse(readFileSync(mapPath, "utf-8")) as { maps: MapEntry[] }).maps;
  const sources = existsSync(srcPath) ? (JSON.parse(readFileSync(srcPath, "utf-8")) as Record<string, SourceInfo>) : {};

  const applied: { slideId: string; table: string; template: string; rows: number }[] = [];
  for (const m of maps) {
    const slide = spec.slides.find((s) => s.id === m.slideId);
    if (!slide) throw new Error(`slideId "${m.slideId}" 스펙에 없음`);
    if (slide.template !== m.template) throw new Error(`"${m.slideId}": 스펙 템플릿(${slide.template}) ≠ 맵(${m.template}) — 폼 변경 시 맵도 갱신`);
    const src = sources[m.table];
    if (!src?.label) throw new Error(`sources.json에 "${m.table}" 항목(label 필수) 없음 — 출처 없는 반입 금지`);
    const { table, file } = loadTable(deckDir, m.table);

    let p: Record<string, unknown>;
    if (m.template === "perf_table" || m.template === "compare_table") {
      p = bindTable(m, table);
      if (!m.unit && src.unit) p.unit = `단위: ${src.unit}`;
    } else if (m.template === "kpi_tiles") p = bindKpi(m, table);
    else if (m.template === "bars") p = bindSeries(m, table, "items");
    else if (m.template === "trend") p = bindSeries(m, table, "pts");
    else throw new Error(`"${m.template}": 미지원 템플릿 (지원: perf_table, compare_table, kpi_tiles, bars, trend)`);

    const s = slide as SlideSpec & { assumed?: boolean };
    s.p = p;
    s.source = { label: src.label, file, ...(src.asOf ? { asOf: src.asOf } : {}) };
    delete s.assumed; // 실데이터는 가정치가 아님 (validate가 동시 지정을 error로 차단)
    s.footnote = `* 자료: ${src.label}${src.asOf ? `, ${src.asOf} 기준` : ""}`;
    applied.push({ slideId: m.slideId, table: m.table, template: m.template, rows: table.rows.length });
  }

  writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n", "utf-8");
  return { applied };
}

// ── CLI ──
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("사용법: npm run deck:data -- decks/<덱>  (deck-spec.json + data.map.json + data/ 필요)");
    process.exit(2);
  }
  try {
    const { applied } = importData(resolve(dir));
    console.log(`데이터 반입 완료: ${basename(resolve(dir))}`);
    for (const a of applied) console.log(`  ${a.slideId}  ←  data/${a.table}  (${a.template}, ${a.rows}행)`);
    console.log("\n다음: npm run deck:validate → deck:build");
  } catch (e) {
    console.error("반입 실패:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
