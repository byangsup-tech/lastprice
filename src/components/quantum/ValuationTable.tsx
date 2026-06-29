"use client";

import { companyByTicker, FACTION_COLOR } from "@/lib/quantum-data";
import { fmtPct, fmtUsdB, fmtX } from "@/lib/quantum-format";
import type { Quote } from "@/lib/quantum-quotes";
import { valuateAll } from "@/lib/valuation";
import ValuationBadge from "./ValuationBadge";

interface Props {
  quotes: Quote[];
}

/** 밸류에이션 표 — "싸다/비싸다" 신호 */
export default function ValuationTable({ quotes }: Props) {
  const verdicts = valuateAll(quotes);
  const rows = quotes
    .map((q) => ({ q, v: verdicts.get(q.ticker)! }))
    .sort((a, b) => {
      const ga = a.v.gaPS ?? Infinity;
      const gb = b.v.gaPS ?? Infinity;
      return ga - gb; // 저렴한(성장보정 P/S 낮은) 순
    });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
      <h2 className="mb-1 text-lg font-bold text-gray-900">
        밸류에이션 — 싸다 / 비싸다
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        성장 보정 P/S(주가매출비율 ÷ 매출성장률)가 낮을수록 성장 대비 저렴.
        피어 중앙값 대비 상대 평가입니다. · <span className="font-medium">투자자문 아님</span>
      </p>

      {/* 모바일: 카드 목록 (가로 스크롤 없이 평가 배지까지 노출) */}
      <ul className="space-y-2 sm:hidden">
        {rows.map(({ q, v }) => {
          const c = companyByTicker(q.ticker);
          return (
            <li
              key={q.ticker}
              className="rounded-xl border border-gray-100 p-3"
              style={{
                borderLeft: `3px solid ${FACTION_COLOR[(c?.faction ?? "US") as "US" | "CN"]}`,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-800">
                  {c?.name ?? q.ticker}
                </span>
                <ValuationBadge verdict={v.verdict} />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <Metric label="시총" value={fmtUsdB(q.marketCapUsd)} />
                <Metric label="P/S" value={fmtX(q.priceToSales)} />
                <Metric label="매출성장" value={fmtPct(q.revenueGrowth)} />
                <Metric
                  label="보정 P/S"
                  value={v.gaPS == null ? "—" : fmtX(v.gaPS)}
                />
              </dl>
            </li>
          );
        })}
      </ul>

      {/* 데스크톱: 표 */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="px-3 py-2">기업</th>
              <th className="px-3 py-2 text-right">시총</th>
              <th className="px-3 py-2 text-right">P/S</th>
              <th className="px-3 py-2 text-right">매출성장</th>
              <th className="px-3 py-2 text-right">보정 P/S</th>
              <th className="px-3 py-2 text-center">평가</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ q, v }) => {
              const c = companyByTicker(q.ticker);
              return (
                <tr key={q.ticker} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          background:
                            FACTION_COLOR[(c?.faction ?? "US") as "US" | "CN"],
                        }}
                      />
                      <span className="font-medium text-gray-800">
                        {c?.name ?? q.ticker}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {fmtUsdB(q.marketCapUsd)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {fmtX(q.priceToSales)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {fmtPct(q.revenueGrowth)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">
                    {v.gaPS == null ? "—" : fmtX(v.gaPS)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ValuationBadge verdict={v.verdict} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-700">{value}</dd>
    </div>
  );
}
