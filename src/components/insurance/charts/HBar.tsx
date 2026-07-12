"use client";

import { useState } from "react";

/**
 * 범용 가로 막대 (순위형 단일 측정값) — DeathCause/FrequentDisease 차트와
 * 같은 규격(단일 색, 데이터 끝만 4px 라운드)의 공통 구현. 신규 차트 전용.
 */

const BAR = "#2a78d6";
const BAR_HOVER = "#1c5cab";
const INK = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";

const W = 640;
const ROW_H = 26;
const BAR_H = 16;
const LABEL_W = 170;
const VALUE_W = 66;

function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w);
  return `M${x},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`;
}

export interface HBarRow {
  label: string;
  value: number;
}

interface Props {
  rows: HBarRow[];
  ariaLabel: string;
  format: (v: number) => string;
  /** 히트 타깃의 <title> 상세 문구 */
  titleOf?: (row: HBarRow) => string;
}

export default function HBar({ rows, ariaLabel, format, titleOf }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value));
  const plotW = W - LABEL_W - VALUE_W;
  const height = rows.length * ROW_H + 8;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      onMouseLeave={() => setHoverIdx(null)}
    >
      <line
        x1={LABEL_W}
        x2={LABEL_W}
        y1={0}
        y2={height - 4}
        stroke={GRID}
        strokeWidth="1"
      />
      {rows.map((row, i) => {
        const y = i * ROW_H + 4;
        const w = Math.max(2, (row.value / max) * plotW);
        const hovered = hoverIdx === i;
        return (
          <g
            key={row.label}
            onMouseEnter={() => setHoverIdx(i)}
            style={{ cursor: "default" }}
          >
            <rect x={0} y={i * ROW_H} width={W} height={ROW_H} fill="transparent">
              <title>{titleOf ? titleOf(row) : `${row.label}: ${format(row.value)}`}</title>
            </rect>
            <text
              x={LABEL_W - 8}
              y={y + BAR_H / 2 + 4}
              textAnchor="end"
              fontSize="12"
              fill={hovered ? "#0b0b0b" : INK}
            >
              {row.label}
            </text>
            <path
              d={barPath(LABEL_W, y, w, BAR_H, 4)}
              fill={hovered ? BAR_HOVER : BAR}
            />
            <text
              x={LABEL_W + w + 6}
              y={y + BAR_H / 2 + 4}
              fontSize="11"
              fill={hovered ? "#0b0b0b" : MUTED}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {format(row.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
