"use client";

import { useMemo, useState } from "react";
import type { LifeExpectancyPoint } from "@/lib/insurance/stats/types";

/**
 * 기대수명 추이 멀티시리즈 라인 차트 (전체/남/여).
 * 색은 검증된 카테고리 팔레트 슬롯 1~3 고정 순서, 텍스트는 잉크 토큰만 사용.
 */

const SERIES = [
  { key: "total", label: "전체", color: "#2a78d6" },
  { key: "male", label: "남자", color: "#1baf7a" },
  { key: "female", label: "여자", color: "#eda100" },
] as const;

const INK = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";

const W = 640;
const H = 280;
const M = { top: 16, right: 64, bottom: 30, left: 38 };

export default function LifeExpectancyChart({
  points,
}: {
  points: LifeExpectancyPoint[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { xOf, yOf, yTicks } = useMemo(() => {
    const years = points.map((p) => p.year);
    const values = points.flatMap((p) => [p.total, p.male, p.female]);
    const xMin = Math.min(...years);
    const xMax = Math.max(...years);
    const yMin = Math.floor(Math.min(...values) / 2) * 2 - 1;
    const yMax = Math.ceil(Math.max(...values) / 2) * 2 + 1;
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xOf = (year: number) =>
      M.left + ((year - xMin) / (xMax - xMin)) * plotW;
    const yOf = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const yTicks: number[] = [];
    for (let t = yMin + 1; t <= yMax; t += 4) yTicks.push(t);
    return { xOf, yOf, yTicks };
  }, [points]);

  const xTicks = useMemo(
    () => points.filter((p) => p.year % 5 === 0).map((p) => p.year),
    [points],
  );

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(xOf(p.year) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? points[hoverIdx] : null;
  const last = points[points.length - 1];

  return (
    <div className="relative">
      {/* 범례 */}
      <div className="mb-2 flex gap-4 text-xs" style={{ color: INK }}>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="연도별 기대수명 추이 (전체·남자·여자)"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 그리드 + y축 눈금 */}
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
              {t}
            </text>
          </g>
        ))}
        {/* 기준선(하단) */}
        <line
          x1={M.left}
          x2={W - M.right}
          y1={H - M.bottom}
          y2={H - M.bottom}
          stroke={BASELINE}
          strokeWidth="1"
        />
        {/* x축 눈금 */}
        {xTicks.map((year) => (
          <text
            key={year}
            x={xOf(year)}
            y={H - M.bottom + 16}
            textAnchor="middle"
            fontSize="11"
            fill={MUTED}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {year}
          </text>
        ))}

        {/* 호버 크로스헤어 */}
        {hover && (
          <line
            x1={xOf(hover.year)}
            x2={xOf(hover.year)}
            y1={M.top}
            y2={H - M.bottom}
            stroke={BASELINE}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* 시리즈 라인 (2px) + 끝점 직접 라벨 */}
        {SERIES.map((s) => {
          const d = points
            .map(
              (p, i) => `${i === 0 ? "M" : "L"}${xOf(p.year)},${yOf(p[s.key])}`,
            )
            .join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" />
              <circle
                cx={xOf(last.year)}
                cy={yOf(last[s.key])}
                r="3"
                fill={s.color}
              />
              <text
                x={xOf(last.year) + 8}
                y={yOf(last[s.key]) + 3.5}
                fontSize="11"
                fill={INK}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.label} {last[s.key].toFixed(1)}
              </text>
              {hover && (
                <circle
                  cx={xOf(hover.year)}
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

      {/* 툴팁 */}
      {hover && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
          style={{
            left: `${Math.min(85, (xOf(hover.year) / W) * 100 + 2)}%`,
          }}
        >
          <div className="font-semibold text-gray-900">{hover.year}년</div>
          {SERIES.map((s) => (
            <div key={s.key} className="mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.color }}
              />
              <span style={{ color: INK }}>
                {s.label} {hover[s.key].toFixed(1)}세
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
