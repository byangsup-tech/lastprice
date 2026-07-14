"use client";

import { useState } from "react";
import type { DeathCauseRow } from "@/lib/insurance/stats/types";

/**
 * 사망원인별 사망률(10만 명당) 순위 가로 막대.
 * 단일 측정값 순위라 단일 색상(팔레트 슬롯 1), 막대 데이터 끝만 4px 라운드.
 */

const BAR = "#2a78d6";
const BAR_HOVER = "#1c5cab";
const INK = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";

const W = 640;
const ROW_H = 26;
const BAR_H = 16;
const LABEL_W = 150;
const VALUE_W = 56;

/** 왼쪽은 기준선에 붙이고 오른쪽(데이터 끝)만 반경 r로 둥글린 막대 */
function barPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w);
  return `M${x},${y} h${w - rr} a${rr},${rr} 0 0 1 ${rr},${rr} v${h - 2 * rr} a${rr},${rr} 0 0 1 ${-rr},${rr} h${-(w - rr)} z`;
}

export default function DeathCauseChart({ rows }: { rows: DeathCauseRow[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.ratePer100k));
  const plotW = W - LABEL_W - VALUE_W;
  const height = rows.length * ROW_H + 8;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      role="img"
      aria-label="사망원인별 인구 10만 명당 사망률 상위 순위"
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* 기준선 */}
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
        const w = Math.max(2, (row.ratePer100k / max) * plotW);
        const hovered = hoverIdx === i;
        return (
          <g
            key={row.cause}
            onMouseEnter={() => setHoverIdx(i)}
            style={{ cursor: "default" }}
          >
            {/* 히트 타깃 (마크보다 크게) */}
            <rect x={0} y={i * ROW_H} width={W} height={ROW_H} fill="transparent">
              <title>
                {row.cause}: 인구 10만 명당 {row.ratePer100k.toFixed(1)}명
              </title>
            </rect>
            <text
              x={LABEL_W - 8}
              y={y + BAR_H / 2 + 4}
              textAnchor="end"
              fontSize="12"
              fill={hovered ? "#0b0b0b" : INK}
            >
              {row.cause}
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
              {row.ratePer100k.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
