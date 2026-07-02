"use client";

import { useMemo, useRef, useState } from "react";
import type { HistoryEntry } from "@/lib/types";

/**
 * 정원·현원 추이 미니 차트 (인라인 SVG, step-after).
 * 공시 데이터는 변경 시점만 기록되므로 계단형 보간이 정직한 표현.
 * 색상: 사전 검증된 레퍼런스 팔레트 (현원=categorical slot1 blue, 정원=뉴트럴 잉크)
 */

const W = 320;
const H = 140;
const PAD = { top: 14, right: 40, bottom: 20, left: 8 };
const COLOR = {
  current: "#2a78d6", // series-1 blue
  capacity: "#898781", // muted ink — 상한 기준선
  grid: "#e1e0d9",
  text: "#52514e",
  muted: "#898781",
  surface: "#ffffff",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dayValue(d: string): number {
  return new Date(d + "T00:00:00Z").getTime() / MS_PER_DAY;
}

function fmtDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

interface TrendChartProps {
  history: HistoryEntry[];
}

export default function TrendChart({ history }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const model = useMemo(() => {
    if (history.length < 2) return null;
    const sorted = [...history].sort((a, b) => (a.d < b.d ? -1 : 1));
    const x0 = dayValue(sorted[0].d);
    // 마지막 관측값을 오늘까지 연장
    const todayIso = new Date().toISOString().slice(0, 10);
    const x1 = Math.max(dayValue(todayIso), dayValue(sorted[sorted.length - 1].d));
    const spanX = Math.max(1, x1 - x0);
    const yMax = Math.max(...sorted.map((e) => e.c)) * 1.08;
    const yMin = Math.max(0, Math.min(...sorted.map((e) => e.n)) * 0.85);
    const spanY = Math.max(1, yMax - yMin);

    const px = (d: string) =>
      PAD.left + ((dayValue(d) - x0) / spanX) * (W - PAD.left - PAD.right);
    const py = (v: number) =>
      PAD.top + (1 - (v - yMin) / spanY) * (H - PAD.top - PAD.bottom);
    const xEnd = W - PAD.right;

    const stepPath = (value: (e: HistoryEntry) => number) => {
      let path = "";
      for (let i = 0; i < sorted.length; i++) {
        const x = px(sorted[i].d);
        const y = py(value(sorted[i]));
        path += i === 0 ? `M${x},${y}` : `L${x},${y}`;
        const nextX = i < sorted.length - 1 ? px(sorted[i + 1].d) : xEnd;
        path += `L${nextX},${y}`;
      }
      return path;
    };

    const last = sorted[sorted.length - 1];
    const currentPath = stepPath((e) => e.n);
    const areaPath = `${currentPath}L${xEnd},${py(yMin)}L${px(sorted[0].d)},${py(yMin)}Z`;

    return {
      sorted,
      px,
      py,
      xEnd,
      capacityPath: stepPath((e) => e.c),
      currentPath,
      areaPath,
      last,
      firstDate: sorted[0].d,
      lastDate: last.d,
    };
  }, [history]);

  if (!model) return null;
  const { sorted, px, py, xEnd, last } = model;

  // step-after 의미에 맞는 최근접 지점: 포인터 x 이하의 마지막 관측
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (px(sorted[i].d) <= x) idx = i;
    }
    setHoverIdx(idx);
  };

  const hover = hoverIdx !== null ? sorted[hoverIdx] : null;

  return (
    <div>
      {/* 범례 — 2개 시리즈이므로 항상 표시, 텍스트는 잉크 토큰 */}
      <div className="mb-1 flex items-center gap-3 text-[10px]" style={{ color: COLOR.text }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: COLOR.capacity }} />
          정원
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: COLOR.current }} />
          현원
        </span>
        {hover && (
          <span className="ml-auto tabular-nums" style={{ color: COLOR.muted }}>
            {fmtDate(hover.d)} · 정원 {hover.c} · 현원 {hover.n}
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={`정원 현원 추이. 최근 정원 ${last.c}명, 현원 ${last.n}명`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* 상하한 헤어라인 그리드 */}
        <line x1={PAD.left} x2={xEnd} y1={py(last.c)} y2={py(last.c)} stroke={COLOR.grid} strokeWidth="1" />
        <line x1={PAD.left} x2={xEnd} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke={COLOR.grid} strokeWidth="1" />

        {/* 현원 영역 워시 (10%) */}
        <path d={model.areaPath} fill={COLOR.current} fillOpacity="0.1" />

        {/* 정원 기준선 (step-after) */}
        <path d={model.capacityPath} fill="none" stroke={COLOR.capacity} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {/* 현원 라인 (step-after) */}
        <path d={model.currentPath} fill="none" stroke={COLOR.current} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* 호버 크로스헤어 */}
        {hover && (
          <line
            x1={px(hover.d)}
            x2={px(hover.d)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke={COLOR.muted}
            strokeWidth="1"
          />
        )}

        {/* 끝점 도트 (2px 서피스 링) + 선택적 끝값 라벨 */}
        <circle cx={xEnd} cy={py(last.c)} r="4" fill={COLOR.capacity} stroke={COLOR.surface} strokeWidth="2" />
        <circle cx={xEnd} cy={py(last.n)} r="4" fill={COLOR.current} stroke={COLOR.surface} strokeWidth="2" />
        <text x={xEnd + 6} y={py(last.c) + 3} fontSize="10" fill={COLOR.text}>
          {last.c}
        </text>
        <text x={xEnd + 6} y={py(last.n) + 3} fontSize="10" fill={COLOR.text}>
          {last.n}
        </text>

        {/* x축 날짜 (시작/끝만) */}
        <text x={PAD.left} y={H - 6} fontSize="9" fill={COLOR.muted}>
          {fmtDate(model.firstDate)}
        </text>
        <text x={xEnd} y={H - 6} fontSize="9" fill={COLOR.muted} textAnchor="end">
          {fmtDate(model.lastDate)}
        </text>
      </svg>
    </div>
  );
}
