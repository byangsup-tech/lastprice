"use client";

import { useMemo, useState } from "react";
import type { InterestRatePoint } from "@/lib/insurance/stats/types";

/**
 * 국고채 3/5/10년 월별 금리 라인 차트.
 * LifeExpectancyChart와 같은 시각 규격(팔레트 슬롯 1~3, 잉크 토큰, 2px 라인)이나
 * x축이 월 문자열 인덱스라 별도 컴포넌트로 둔다 (3번째 라인차트 등장 시 추출).
 * x좌표는 배열 인덱스 — 월 문자열을 Date로 파싱하지 않는다 (타임존 함정).
 */

const SERIES = [
  { key: "y3", label: "3년", color: "#2a78d6" },
  { key: "y5", label: "5년", color: "#1baf7a" },
  { key: "y10", label: "10년", color: "#eda100" },
] as const;

const INK = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";

const W = 640;
const H = 280;
const M = { top: 16, right: 64, bottom: 30, left: 40 };

/** "2026-06" → "26.06" */
function shortMonth(month: string): string {
  return `${month.slice(2, 4)}.${month.slice(5, 7)}`;
}

export default function InterestRateChart({
  points,
}: {
  points: InterestRatePoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { xOf, yOf, yTicks } = useMemo(() => {
    const values = points.flatMap((p) => [p.y3, p.y5, p.y10]);
    const yMin = Math.floor((Math.min(...values) - 0.2) * 2) / 2;
    const yMax = Math.ceil((Math.max(...values) + 0.2) * 2) / 2;
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xOf = (i: number) =>
      M.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
    const yOf = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const yTicks: number[] = [];
    for (let t = yMin; t <= yMax + 1e-9; t += 0.5) yTicks.push(Number(t.toFixed(1)));
    return { xOf, yOf, yTicks };
  }, [points]);

  const xTickStep = Math.max(1, Math.floor(points.length / 5));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((_, i) => {
      const d = Math.abs(xOf(i) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const hoverX = hoverIdx != null ? xOf(hoverIdx) : 0;
  const lastIdx = points.length - 1;
  const last = points[lastIdx];

  return (
    <div className="relative">
      <div className="mb-2 flex gap-4 text-xs" style={{ color: INK }}>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: s.color }}
            />
            국고채 {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="국고채 3년·5년·10년 월별 금리 추이"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={yOf(t)}
              y2={yOf(t)}
              stroke={GRID}
              strokeWidth="1"
            />
            <text
              x={M.left - 6}
              y={yOf(t) + 3.5}
              textAnchor="end"
              fontSize="11"
              fill={MUTED}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <line
          x1={M.left}
          x2={W - M.right}
          y1={H - M.bottom}
          y2={H - M.bottom}
          stroke={BASELINE}
          strokeWidth="1"
        />
        {points.map((p, i) =>
          i % xTickStep === 0 ? (
            <text
              key={p.month}
              x={xOf(i)}
              y={H - M.bottom + 16}
              textAnchor="middle"
              fontSize="11"
              fill={MUTED}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {shortMonth(p.month)}
            </text>
          ) : null,
        )}

        {hover && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={M.top}
            y2={H - M.bottom}
            stroke={BASELINE}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {SERIES.map((s) => {
          const d = points
            .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(p[s.key])}`)
            .join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
              <circle
                cx={xOf(lastIdx)}
                cy={yOf(last[s.key])}
                r="3"
                fill={s.color}
              />
              <text
                x={xOf(lastIdx) + 8}
                y={yOf(last[s.key]) + 3.5}
                fontSize="11"
                fill={INK}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.label} {last[s.key].toFixed(2)}
              </text>
              {hover && (
                <circle
                  cx={hoverX}
                  cy={yOf(hover[s.key])}
                  r="4"
                  fill={s.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
          style={{ left: `${Math.min(82, (hoverX / W) * 100 + 2)}%` }}
        >
          <div className="font-semibold text-gray-900">{hover.month}</div>
          {SERIES.map((s) => (
            <div key={s.key} className="mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span style={{ color: INK }}>
                {s.label} {hover[s.key].toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
