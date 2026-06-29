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

      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[560px] text-sm">
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
