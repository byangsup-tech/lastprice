"use client";

import {
  COMPANIES,
  FACTION_COLOR,
  LISTED_TICKERS,
  QUANTUM_TAM,
} from "@/lib/quantum-data";
import { fmtUsdB } from "@/lib/quantum-format";
import { useQuotes } from "@/hooks/useQuotes";
import AsymmetryNarrative from "./AsymmetryNarrative";
import GrowthPotential from "./GrowthPotential";
import MarketCapChart from "./MarketCapChart";
import MarketCapTimeline from "./MarketCapTimeline";
import SourcesFooter from "./SourcesFooter";
import ValuationTable from "./ValuationTable";
import ValueChainComparison from "./ValueChainComparison";

export default function QuantumDashboard() {
  const { data, loading, error } = useQuotes();
  const quotes = data?.quotes ?? [];

  const capByTicker = new Map(quotes.map((q) => [q.ticker, q.marketCapUsd]));
  const sumFor = (faction: "US" | "CN") =>
    COMPANIES.filter((c) => c.faction === faction && c.listed).reduce(
      (s, c) => s + (capByTicker.get(c.ticker) ?? 0),
      0,
    );
  const usCap = sumFor("US");
  const cnCap = sumFor("CN");
  const tam2035 = QUANTUM_TAM.find((p) => p.year === 2035);

  const liveBadge =
    data?.source === "live"
      ? { text: "🟢 실시간", cls: "bg-green-100 text-green-700" }
      : { text: "🟡 스냅샷", cls: "bg-amber-100 text-amber-700" };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      {/* Hero */}
      <header className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
            양자 산업
          </span>
          {data && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${liveBadge.cls}`}
            >
              {liveBadge.text}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
          🇺🇸 미국 vs 🇨🇳 중국 <span className="text-gray-400">·</span> 양자 산업
          대결
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          순수 양자 상장사의 밸류체인·시총·밸류에이션·성장 잠재력을 한눈에. 이
          기업이 싸다 / 비싸다, 얼마나 더 커질지 비교합니다.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 p-3 text-sm text-red-600">
          {error} — 스냅샷 데이터로 표시합니다.
        </div>
      )}

      {/* KPI 카드 */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="🇺🇸 미국 합산 시총"
          value={fmtUsdB(usCap)}
          color={FACTION_COLOR.US}
          loading={loading}
        />
        <KpiCard
          label="🇨🇳 중국 합산 시총"
          value={fmtUsdB(cnCap)}
          color={FACTION_COLOR.CN}
          loading={loading}
          hint="상장사 기준 (다수 비상장)"
        />
        <KpiCard
          label="상장 순수 양자기업"
          value={`${LISTED_TICKERS.length}곳`}
          color="#7c3aed"
        />
        <KpiCard
          label="2035 시장 전망"
          value={tam2035 ? `$${tam2035.low}–${tam2035.high}B` : "—"}
          color="#0891b2"
        />
      </div>

      <div className="space-y-6">
        <ValueChainComparison quotes={quotes} />
        <MarketCapChart quotes={quotes} />
        <ValuationTable quotes={quotes} />
        <GrowthPotential quotes={quotes} />
        <MarketCapTimeline tickers={LISTED_TICKERS} />
        <AsymmetryNarrative />
        <SourcesFooter
          source={data?.source ?? "snapshot"}
          asOf={data?.asOf ?? ""}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  hint,
  loading,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white p-4"
      style={{ borderTopColor: color, borderTopWidth: 3 }}
    >
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">
        {loading ? "…" : value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-gray-400">{hint}</div>}
    </div>
  );
}
