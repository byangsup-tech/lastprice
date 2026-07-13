"use client";

import Sparkline from "./Sparkline";
import type { KeywordTrendsResponse } from "@/lib/insurance/types";

/**
 * Exploding Topics식 관심 키워드 카드 — 키워드명 + 국면 라벨 + 스파크라인 +
 * 성장률 배지 + 매칭 기사 수.
 */

interface Props {
  data: KeywordTrendsResponse;
  /** 키워드별 현재 피드 매칭 기사 수 */
  matchCounts: Map<string, number>;
  onSelectKeyword?: (keyword: string) => void;
}

function phaseOf(changePct: number | null): { label: string; cls: string } {
  if (changePct == null) return { label: "데이터 부족", cls: "bg-gray-100 text-gray-500" };
  if (changePct >= 20) return { label: "급상승", cls: "bg-teal-700 text-white" };
  if (changePct >= 5) return { label: "상승", cls: "bg-teal-100 text-teal-700" };
  if (changePct <= -5) return { label: "하락", cls: "bg-gray-200 text-gray-500" };
  return { label: "보합", cls: "bg-gray-100 text-gray-500" };
}

export default function KeywordTrendCards({
  data,
  matchCounts,
  onSelectKeyword,
}: Props) {
  if (!data.trends.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {data.trends.map((trend) => {
        const phase = phaseOf(trend.changePct);
        const matches = matchCounts.get(trend.keyword) ?? 0;
        return (
          <div
            key={trend.keyword}
            className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5"
          >
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
                {trend.keyword}
              </span>
              <span
                className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${phase.cls}`}
              >
                {phase.label}
              </span>
              {data.status === "demo" && (
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  예시
                </span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2">
              <Sparkline
                values={trend.values}
                color={
                  trend.changePct != null && trend.changePct >= 5
                    ? "#0f766e"
                    : "#9ca3af"
                }
              />
              {trend.changePct != null && (
                <span
                  className={`text-xs font-bold ${
                    trend.changePct >= 5
                      ? "text-teal-700"
                      : trend.changePct <= -5
                        ? "text-gray-400"
                        : "text-gray-500"
                  }`}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {trend.changePct >= 0 ? "+" : ""}
                  {trend.changePct.toFixed(0)}%
                </span>
              )}
            </div>
            <button
              onClick={() => onSelectKeyword?.(trend.keyword)}
              className="self-start text-[11px] text-gray-400 hover:text-teal-700 hover:underline"
            >
              매칭 기사 {matches}건 · 검색 수요 최근 3개월
            </button>
          </div>
        );
      })}
    </div>
  );
}
