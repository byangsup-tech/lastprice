"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { companyByTicker, FACTION_COLOR } from "@/lib/quantum-data";
import { useHistory } from "@/hooks/useHistory";

interface Props {
  /** 선택 가능한 티커 목록 */
  tickers: string[];
}

const RANGES = [
  { id: "1y", label: "1년" },
  { id: "5y", label: "5년" },
];

/** 시총/주가 타임라인 추세 (단일 종목, 1Y/5Y 토글) */
export default function MarketCapTimeline({ tickers }: Props) {
  const [ticker, setTicker] = useState(tickers[0] ?? "");
  const [range, setRange] = useState("1y");
  const { data, loading } = useHistory(ticker, range);

  const company = companyByTicker(ticker);
  const color = FACTION_COLOR[(company?.faction ?? "US") as "US" | "CN"];
  const chartData = (data?.points ?? []).map((p) => ({
    date: new Date(p.t).toISOString().slice(0, 10),
    close: p.close,
  }));

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-gray-900">주가 추세 타임라인</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                range === r.id
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 종목 선택 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tickers.map((t) => {
          const c = companyByTicker(t);
          const selected = t === ticker;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTicker(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                selected ? "text-white" : "bg-gray-100 text-gray-600"
              }`}
              style={
                selected
                  ? { background: FACTION_COLOR[(c?.faction ?? "US") as "US" | "CN"] }
                  : undefined
              }
            >
              {c?.name ?? t}
            </button>
          );
        })}
      </div>

      <div className="h-64 w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {loading ? "불러오는 중…" : "데이터 없음"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v) => [`${Number(v)}`, "종가"]}
                labelStyle={{ fontSize: 12 }}
              />
              <Line
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {data?.source === "snapshot" && (
        <p className="mt-2 text-[11px] text-amber-600">
          ⚠ 실시간 시세 연결 불가 — 합성 추세(예시)를 표시 중입니다.
        </p>
      )}
    </section>
  );
}
