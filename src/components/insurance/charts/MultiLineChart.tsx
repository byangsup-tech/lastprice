"use client";

import { useMemo, useState } from "react";

/**
 * 범용 멀티시리즈 라인 차트 — 카테고리형(인덱스) x축.
 * 3번째 라인 차트가 필요해지면서 추출한 공통 구현 — 신규 차트에만 사용하고
 * 기존 LifeExpectancyChart/InterestRateChart는 건드리지 않는다(회귀 방지).
 * 시각 규격은 동일: 검증된 팔레트 슬롯 고정 순서, 잉크 토큰, 2px 라인,
 * 끝점 직접 라벨, 호버 크로스헤어 툴팁.
 */

const PALETTE = ["#2a78d6", "#1baf7a", "#eda100"];
const INK = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const BASELINE = "#c3c2b7";

const W = 640;
const H = 280;
const M = { top: 16, right: 88, bottom: 30, left: 44 };

export interface LineSeries {
  name: string;
  /** labels와 같은 길이 */
  values: number[];
}

interface Props {
  /** x축 카테고리 라벨 (연도·연령대 등) */
  labels: string[];
  /** 최대 3개 — 팔레트 슬롯 고정 순서 */
  series: LineSeries[];
  ariaLabel: string;
  /** y축 눈금·툴팁 값 포맷 */
  format?: (v: number) => string;
  /** x축 눈금을 n개마다 표시 (기본: ~5개가 되도록 자동) */
  xTickEvery?: number;
  /** y축을 0부터 시작 (발생 곡선 등 크기 비교용) */
  zeroBased?: boolean;
}

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const rawStep = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? mag * 10;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

export default function MultiLineChart({
  labels,
  series,
  ariaLabel,
  format = (v) => String(v),
  xTickEvery,
  zeroBased = false,
}: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { xOf, yOf, yTicks } = useMemo(() => {
    const values = series.flatMap((s) => s.values);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = (rawMax - rawMin || 1) * 0.08;
    const yMin = zeroBased ? 0 : rawMin - pad;
    const yMax = rawMax + pad;
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xOf = (i: number) =>
      M.left + (labels.length > 1 ? (i / (labels.length - 1)) * plotW : 0);
    const yOf = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    return { xOf, yOf, yTicks: niceTicks(yMin, yMax) };
  }, [labels, series, zeroBased]);

  const tickStep = xTickEvery ?? Math.max(1, Math.floor(labels.length / 5));

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    labels.forEach((_, i) => {
      const d = Math.abs(xOf(i) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHoverIdx(best);
  }

  const hoverX = hoverIdx != null ? xOf(hoverIdx) : 0;
  const lastIdx = labels.length - 1;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: INK }}>
        {series.map((s, si) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: PALETTE[si] }}
            />
            {s.name}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={ariaLabel}
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
              {format(t)}
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
        {labels.map((label, i) =>
          i % tickStep === 0 ? (
            <text
              key={label}
              x={xOf(i)}
              y={H - M.bottom + 16}
              textAnchor="middle"
              fontSize="11"
              fill={MUTED}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {label}
            </text>
          ) : null,
        )}

        {hoverIdx != null && (
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

        {series.map((s, si) => {
          const color = PALETTE[si];
          const d = s.values
            .map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(v)}`)
            .join(" ");
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={color} strokeWidth="2" />
              <circle
                cx={xOf(lastIdx)}
                cy={yOf(s.values[lastIdx])}
                r="3"
                fill={color}
              />
              <text
                x={xOf(lastIdx) + 8}
                y={yOf(s.values[lastIdx]) + 3.5}
                fontSize="11"
                fill={INK}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(s.values[lastIdx])}
              </text>
              {hoverIdx != null && (
                <circle
                  cx={hoverX}
                  cy={yOf(s.values[hoverIdx])}
                  r="4"
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
      </svg>

      {hoverIdx != null && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-sm"
          style={{ left: `${Math.min(78, (hoverX / W) * 100 + 2)}%` }}
        >
          <div className="font-semibold text-gray-900">{labels[hoverIdx]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: PALETTE[si] }}
              />
              <span style={{ color: INK }}>
                {s.name} {format(s.values[hoverIdx])}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
