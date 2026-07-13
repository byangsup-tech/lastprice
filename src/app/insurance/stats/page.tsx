"use client";

import Link from "next/link";
import { useState } from "react";
import ChartFooter from "@/components/insurance/ChartFooter";
import RangeSegment, {
  type RangeOption,
} from "@/components/insurance/RangeSegment";
import DeathCauseChart from "@/components/insurance/charts/DeathCauseChart";
import FrequentDiseaseChart from "@/components/insurance/charts/FrequentDiseaseChart";
import HBar from "@/components/insurance/charts/HBar";
import InterestRateChart from "@/components/insurance/charts/InterestRateChart";
import LifeExpectancyChart from "@/components/insurance/charts/LifeExpectancyChart";
import MultiLineChart from "@/components/insurance/charts/MultiLineChart";
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

const MONTH_RANGES: RangeOption[] = [
  { label: "3개월", count: 3 },
  { label: "12개월", count: 12 },
  { label: "전체", count: null },
];

/** 최근 n개만 (null = 전체) */
function tail<T>(arr: T[], n: number | null): T[] {
  return n == null ? arr : arr.slice(-n);
}

export default function InsuranceStatsPage() {
  const { data, loading, error } = useInsuranceStats();
  const [trendRange, setTrendRange] = useState<number | null>(12);
  const [rateRange, setRateRange] = useState<number | null>(12);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-gray-900">📊 위험률 통계 패널</h1>
        <p className="text-xs text-gray-500">
          검색 수요 · 사망·질병 통계 · 시장금리
        </p>
        <Link
          href="/insurance"
          className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          ← 뉴스 피드
        </Link>
      </header>

      {data &&
        [
          data.lifeExpectancy,
          data.deathCauses,
          data.treasuryYields,
          data.frequentDiseases,
          data.cancerIncidence,
          data.ageProfile,
          data.infectious,
          data.searchTrends,
        ].some((b) => b.status === "demo") && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
            <strong>예시 수치 표시 중:</strong> 공표 통계의 근사치입니다.{" "}
            <code className="rounded bg-amber-100 px-1">KOSIS_API_KEY</code>
            (사망·질병),{" "}
            <code className="rounded bg-amber-100 px-1">ECOS_API_KEY</code>
            (금리)를 설정하면 실데이터로 전환됩니다.
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
                검색 수요 트렌드
              </h2>
              <span className="text-xs text-gray-400">
                네이버 검색량 상대지수 (최대=100)
              </span>
              <BlockBadge block={data.searchTrends} />
              <RangeSegment
                options={MONTH_RANGES}
                value={trendRange}
                onChange={setTrendRange}
              />
            </div>
            <MultiLineChart
              labels={tail(data.searchTrends.data.months, trendRange).map(
                (m) => `${m.slice(2, 4)}.${m.slice(5, 7)}`,
              )}
              series={data.searchTrends.data.series.map((s) => ({
                name: s.name,
                values: tail(s.values, trendRange),
              }))}
              ariaLabel="보험 상품 키워드 월별 검색 수요 추이"
              format={(v) => String(Math.round(v))}
            />
            <p className="mt-2 text-xs text-gray-400">
              키워드는 <code className="rounded bg-gray-100 px-1">DATALAB_KEYWORDS</code>
              (쉼표 구분, 최대 5개)로 교체 가능
            </p>
            <ChartFooter
              source="네이버 데이터랩 검색어트렌드"
              filename="검색수요트렌드"
              csvRows={() => [
                ["월", ...data.searchTrends.data.series.map((s) => s.name)],
                ...data.searchTrends.data.months.map((m, i) => [
                  m,
                  ...data.searchTrends.data.series.map((s) => s.values[i]),
                ]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                기대수명 추이
              </h2>
              <span className="text-xs text-gray-400">단위: 세 (0세 기대여명)</span>
              <BlockBadge block={data.lifeExpectancy} />
            </div>
            <LifeExpectancyChart points={data.lifeExpectancy.data} />
            <ChartFooter
              source="통계청 생명표 (KOSIS)"
              filename="기대수명추이"
              csvRows={() => [
                ["연도", "전체", "남자", "여자"],
                ...data.lifeExpectancy.data.map((p) => [
                  p.year,
                  p.total,
                  p.male,
                  p.female,
                ]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                암 조발생률 추이
              </h2>
              <span className="text-xs text-gray-400">
                인구 10만 명당 (국가암등록통계) · 암보험 위험률 참고
              </span>
              <BlockBadge block={data.cancerIncidence} />
            </div>
            <MultiLineChart
              labels={data.cancerIncidence.data.map((p) => String(p.year))}
              series={[
                { name: "전체", values: data.cancerIncidence.data.map((p) => p.total) },
                { name: "남자", values: data.cancerIncidence.data.map((p) => p.male) },
                { name: "여자", values: data.cancerIncidence.data.map((p) => p.female) },
              ]}
              ariaLabel="연도별 암 조발생률 추이 (전체·남자·여자)"
              format={(v) => v.toFixed(0)}
            />
            <ChartFooter
              source="국가암등록통계 (KOSIS)"
              filename="암조발생률추이"
              csvRows={() => [
                ["연도", "전체", "남자", "여자"],
                ...data.cancerIncidence.data.map((p) => [
                  p.year,
                  p.total,
                  p.male,
                  p.female,
                ]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                연령대별 주요 질환 프로파일
              </h2>
              <span className="text-xs text-gray-400">
                연간 진료인원 (만 명) · 발생 곡선 형태 참고
              </span>
              <BlockBadge block={data.ageProfile} />
            </div>
            <MultiLineChart
              labels={data.ageProfile.data.ageBands}
              series={data.ageProfile.data.series}
              ariaLabel="연령대별 주요 질환 진료인원 곡선"
              format={(v) => `${v}만`}
              xTickEvery={1}
              zeroBased
            />
            <ChartFooter
              source="건강보험심사평가원 (공공데이터포털)"
              filename="연령대별질환프로파일"
              csvRows={() => [
                ["연령대", ...data.ageProfile.data.series.map((s) => s.name)],
                ...data.ageProfile.data.ageBands.map((band, i) => [
                  band,
                  ...data.ageProfile.data.series.map((s) => `${s.values[i]}만`),
                ]),
              ]}
            />
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
            <ChartFooter
              source="통계청 사망원인통계 (KOSIS)"
              filename="사망원인Top10"
              csvRows={() => [
                ["사망원인", "인구 10만 명당 사망률"],
                ...data.deathCauses.data.map((r) => [r.cause, r.ratePer100k]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                다빈도 질병 Top 10
              </h2>
              <span className="text-xs text-gray-400">
                연간 진료인원 · 건강·제3보험 담보 참고
              </span>
              <BlockBadge block={data.frequentDiseases} />
            </div>
            <FrequentDiseaseChart rows={data.frequentDiseases.data} />
            <ChartFooter
              source="건강보험심사평가원 다빈도질병 (KOSIS)"
              filename="다빈도질병Top10"
              csvRows={() => [
                ["질병", "연간 진료인원(명)"],
                ...data.frequentDiseases.data.map((r) => [
                  r.disease,
                  r.patients,
                ]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                법정감염병 주간 신고 Top 5
              </h2>
              <span className="text-xs text-gray-400">
                주간 갱신 (질병관리청) · 실손 단기 손해율 신호
              </span>
              <BlockBadge block={data.infectious} />
            </div>
            <HBar
              rows={data.infectious.data.map((r) => ({
                label: r.disease,
                value: r.weeklyCases,
              }))}
              ariaLabel="법정감염병 주간 신고 건수 상위"
              format={(v) => v.toLocaleString("ko-KR")}
              titleOf={(row) =>
                `${row.label}: 주간 ${row.value.toLocaleString("ko-KR")}건 신고`
              }
            />
            <ChartFooter
              source="질병관리청 감염병 발생현황 (공공데이터포털)"
              filename="감염병주간Top5"
              csvRows={() => [
                ["감염병", "주간 신고 건수"],
                ...data.infectious.data.map((r) => [r.disease, r.weeklyCases]),
              ]}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">
                국고채 금리 추이
              </h2>
              <span className="text-xs text-gray-400">
                단위: % (월평균) · 예정이율·공시이율 검토 참고
              </span>
              <BlockBadge block={data.treasuryYields} />
              <RangeSegment
                options={MONTH_RANGES}
                value={rateRange}
                onChange={setRateRange}
              />
            </div>
            <InterestRateChart points={tail(data.treasuryYields.data, rateRange)} />
            <ChartFooter
              source="한국은행 ECOS 시장금리 (721Y001)"
              filename="국고채금리추이"
              csvRows={() => [
                ["월", "국고채 3년(%)", "국고채 5년(%)", "국고채 10년(%)"],
                ...data.treasuryYields.data.map((p) => [
                  p.month,
                  p.y3,
                  p.y5,
                  p.y10,
                ]),
              ]}
            />
          </section>

          <footer className="mt-2 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400">
            출처: 통계청 생명표·사망원인통계, 국가암등록통계, HIRA
            다빈도질병·연령별 통계, 질병관리청 감염병 (KOSIS·data.go.kr) ·
            한국은행 ECOS 시장금리
            <br />
            확장 예정: 유지율·경쟁사 경영통계(FISIS) · 비급여 진료비 ·
            장래인구추계
          </footer>
        </>
      )}
    </main>
  );
}
