"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  companyByTicker,
  FACTION_COLOR,
  FACTION_LABEL,
} from "@/lib/quantum-data";
import { fmtUsdB } from "@/lib/quantum-format";
import type { Quote } from "@/lib/quantum-quotes";

interface Props {
  quotes: Quote[];
}

/** 현재 시총 비교 (항상 표시). 미국=파랑, 중국=빨강. */
export default function MarketCapChart({ quotes }: Props) {
  const rows = quotes
    .map((q) => {
      const c = companyByTicker(q.ticker);
      return {
        ticker: q.ticker,
        name: c?.name ?? q.ticker,
        faction: c?.faction ?? "US",
        capUsd: q.marketCapUsd,
      };
    })
    .sort((a, b) => b.capUsd - a.capUsd);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-gray-900">
        현재 시가총액 비교
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        상장 순수 양자기업 (USD 환산, 중국 A주는 환율 적용). 단위: 10억 달러.
      </p>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={92}
              tick={{ fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v) => [fmtUsdB(Number(v)), "시총"]}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar dataKey="capUsd" radius={[0, 6, 6, 0]} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell
                  key={r.ticker}
                  fill={FACTION_COLOR[r.faction as "US" | "CN"]}
                />
              ))}
              <LabelList
                dataKey="capUsd"
                position="right"
                formatter={(v) => fmtUsdB(Number(v))}
                style={{ fontSize: 11, fill: "#6b7280" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: FACTION_COLOR.US }}
          />
          {FACTION_LABEL.US}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded"
            style={{ background: FACTION_COLOR.CN }}
          />
          {FACTION_LABEL.CN}
        </span>
      </div>
    </section>
  );
}
