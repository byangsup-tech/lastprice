"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  companyByTicker,
  FACTION_COLOR,
  QUANTUM_TAM,
  QUANTUM_VALUE_2035_TRILLION_USD,
} from "@/lib/quantum-data";
import { fmtPct, fmtUsdB } from "@/lib/quantum-format";
import type { Quote } from "@/lib/quantum-quotes";

interface Props {
  quotes: Quote[];
}

/** "얼마나 더 커질까" — 시장 전망(TAM) + 애널리스트 상승여력 */
export default function GrowthPotential({ quotes }: Props) {
  const totalCapUsd = quotes.reduce((s, q) => s + q.marketCapUsd, 0);
  const tamRows = QUANTUM_TAM.map((p) => ({
    year: p.year,
    mid: Math.round((p.low + p.high) / 2),
    low: p.low,
    high: p.high,
  }));
  const tam2035 = tamRows.find((r) => r.year === 2035);

  const upsideRows = quotes
    .filter((q) => q.targetUpside != null)
    .map((q) => ({ ticker: q.ticker, upside: q.targetUpside as number }))
    .sort((a, b) => b.upside - a.upside);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-gray-900">
        성장 잠재력 — 얼마나 더 커질까
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        양자컴퓨팅 시장 규모 전망(공개 리포트 기반 추정 레인지)과 애널리스트
        목표주가 대비 상승여력.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 시장 규모(TAM) 전망 */}
        <div>
          <div className="mb-2 text-sm font-semibold text-gray-700">
            양자컴퓨팅 시장 규모 전망 (10억 USD)
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={tamRows}
                margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="tamFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  formatter={(v, n) => [
                    `$${Number(v)}B`,
                    n === "mid" ? "중앙 추정" : String(n),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="mid"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  fill="url(#tamFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            현재 상장 순수 양자기업 합산 시총{" "}
            <span className="font-semibold text-gray-700">
              {fmtUsdB(totalCapUsd)}
            </span>{" "}
            vs 2035년 시장 규모 추정{" "}
            <span className="font-semibold text-gray-700">
              ${tam2035?.low}–{tam2035?.high}B
            </span>
            . 양자기술 전체 가치 창출은 2035년까지 최대{" "}
            <span className="font-semibold text-gray-700">
              ${QUANTUM_VALUE_2035_TRILLION_USD}조
            </span>{" "}
            전망(McKinsey).
          </p>
        </div>

        {/* 애널리스트 상승여력 */}
        <div>
          <div className="mb-2 text-sm font-semibold text-gray-700">
            애널리스트 목표주가 대비 상승여력
          </div>
          {upsideRows.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400">
              상승여력 데이터 없음
            </div>
          ) : (
            <ul className="space-y-2">
              {upsideRows.map((r) => {
                const c = companyByTicker(r.ticker);
                const pos = r.upside >= 0;
                const mag = Math.min(Math.abs(r.upside), 1);
                return (
                  <li key={r.ticker} className="text-xs">
                    <div className="mb-0.5 flex justify-between">
                      <span className="font-medium text-gray-700">
                        {c?.name ?? r.ticker}
                      </span>
                      <span
                        className={pos ? "text-green-600" : "text-red-600"}
                      >
                        {fmtPct(r.upside)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${mag * 100}%`,
                          background: pos
                            ? "#16a34a"
                            : FACTION_COLOR.CN,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-gray-400">
            상승여력 = 평균 목표주가 ÷ 현재가 − 1. 시장 컨센서스이며 보장이 아님.
          </p>
        </div>
      </div>
    </section>
  );
}
