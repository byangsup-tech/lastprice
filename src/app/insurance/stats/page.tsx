"use client";

import Link from "next/link";
import DeathCauseChart from "@/components/insurance/charts/DeathCauseChart";
import LifeExpectancyChart from "@/components/insurance/charts/LifeExpectancyChart";
import StatTile from "@/components/insurance/StatTile";
import { useInsuranceStats } from "@/hooks/useInsuranceStats";
import type { StatsBlock } from "@/lib/insurance/stats/types";

function BlockBadge({ block }: { block: StatsBlock<unknown> }) {
  if (block.status === "live") return null;
  const label = block.status === "stale" ? "지연(캐시)" : "예시";
  return (
    <span
      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
      title={block.note}
    >
      {label}
    </span>
  );
}

export default function InsuranceStatsPage() {
  const { data, loading, error } = useInsuranceStats();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-gray-900">📊 위험률 통계 패널</h1>
        <p className="text-xs text-gray-500">사망·질병 통계 (KOSIS 연간)</p>
        <Link
          href="/insurance"
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          ← 뉴스 피드
        </Link>
      </header>

      {data?.lifeExpectancy.status === "demo" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <strong>예시 수치 표시 중:</strong> 공표 통계의 근사치입니다.{" "}
          <code className="rounded bg-amber-100 px-1">KOSIS_API_KEY</code>를
          설정하면 국가통계포털 실데이터로 전환됩니다.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          통계를 불러오지 못했습니다: {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white"
              />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-72 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.tiles.map((tile) => (
              <StatTile key={tile.label} tile={tile} />
            ))}
          </div>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                기대수명 추이
              </h2>
              <span className="text-xs text-gray-400">단위: 세 (0세 기대여명)</span>
              <BlockBadge block={data.lifeExpectancy} />
            </div>
            <LifeExpectancyChart points={data.lifeExpectancy.data} />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                사망원인 Top 10
              </h2>
              <span className="text-xs text-gray-400">
                {data.deathCausesYear}년 · 인구 10만 명당 사망률
              </span>
              <BlockBadge block={data.deathCauses} />
            </div>
            <DeathCauseChart rows={data.deathCauses.data} />
          </section>

          <footer className="mt-2 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400">
            출처: 통계청 생명표·사망원인통계 (KOSIS 국가통계포털) · 연 1회 갱신
            <br />
            확장 예정: 다빈도 질병(HIRA) · 감염병(질병관리청) · 재해·교통사고 통계
          </footer>
        </>
      )}
    </main>
  );
}
