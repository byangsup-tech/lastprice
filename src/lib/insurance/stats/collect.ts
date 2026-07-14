import { getCached } from "../cache";
import {
  fetchAgeProfile,
  fetchWeeklyInfectious,
  hasDataGoKrKey,
} from "./datago";
import { fetchSearchTrends, hasNaverKeys, recentChangePct } from "./datalab";
import {
  DEMO_AGE_PROFILE,
  DEMO_CANCER_INCIDENCE,
  DEMO_CANCER_SURVIVAL,
  DEMO_DEATH_CAUSES,
  DEMO_DEATH_CAUSES_YEAR,
  DEMO_FREQUENT_DISEASES,
  DEMO_INFECTIOUS,
  DEMO_LIFE_EXPECTANCY,
  DEMO_SEARCH_TRENDS,
  DEMO_TREASURY_YIELDS,
} from "./demo";
import { fetchTreasuryYields, hasEcosKey } from "./ecos";
import {
  fetchCancerIncidence,
  fetchDeathCauses,
  fetchFrequentDiseases,
  fetchLifeExpectancy,
  hasKosisKey,
} from "./kosis";
import type {
  StatsBlock,
  StatsResponse,
  StatTileData,
  LifeExpectancyPoint,
  DeathCauseRow,
  InterestRatePoint,
  CancerIncidencePoint,
  SearchTrendData,
} from "./types";

/** 연간(질병·사망)/월간(금리) 통계라 하루 캐시면 충분 */
const STATS_TTL_MS = 24 * 60 * 60 * 1000;

interface BlockOpts {
  hasKey: boolean;
  noKeyNote: string;
}

async function block<T>(
  key: string,
  fetcher: () => Promise<T>,
  demoData: T,
  opts: BlockOpts,
): Promise<StatsBlock<T>> {
  if (!opts.hasKey) {
    return { status: "demo", note: opts.noKeyNote, data: demoData };
  }
  try {
    const { data, status } = await getCached(key, fetcher, STATS_TTL_MS);
    return { status, data };
  } catch (err) {
    return {
      status: "demo",
      note: `수집 실패(${err instanceof Error ? err.message : String(err)}) — 근사치 예시`,
      data: demoData,
    };
  }
}

/** 최근 3개월 평균 vs 그 이전 3개월 평균 — 검색 수요 상승 1위 키워드 */
function topRisingKeyword(
  trends: SearchTrendData,
): { name: string; changePct: number; values: number[] } | null {
  let best: { name: string; changePct: number; values: number[] } | null = null;
  for (const s of trends.series) {
    const changePct = recentChangePct(s.values);
    if (changePct == null) continue;
    if (!best || changePct > best.changePct) {
      best = { name: s.name, changePct, values: s.values };
    }
  }
  return best;
}

/** 스파크라인용 최근 n개 */
const tail = (values: number[], n = 12) => values.slice(-n);

function buildTiles(
  life: LifeExpectancyPoint[],
  causes: DeathCauseRow[],
  causesYear: number,
  rates: InterestRatePoint[],
  cancer: StatsBlock<CancerIncidencePoint[]>,
  trends: SearchTrendData,
): StatTileData[] {
  const tiles: StatTileData[] = [];
  const latest = life[life.length - 1];
  const prev = life[life.length - 2];
  if (latest) {
    const delta = prev ? latest.total - prev.total : null;
    tiles.push({
      label: "기대수명",
      asOf: String(latest.year),
      value: latest.total.toFixed(1),
      unit: "세",
      sub:
        delta == null
          ? undefined
          : `전기 대비 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}세`,
      spark: tail(life.map((p) => p.total)),
    });
    tiles.push({
      label: "남녀 기대수명 차이",
      asOf: String(latest.year),
      value: (latest.female - latest.male).toFixed(1),
      unit: "년",
      sub: `남 ${latest.male.toFixed(1)} · 여 ${latest.female.toFixed(1)}`,
      spark: tail(life.map((p) => Number((p.female - p.male).toFixed(2)))),
    });
  }
  if (causes[0]) {
    tiles.push({
      label: "사망원인 1위",
      asOf: String(causesYear),
      value: causes[0].cause,
      sub: `10만 명당 ${causes[0].ratePer100k.toFixed(1)}명`,
    });
  }
  const rateLatest = rates[rates.length - 1];
  const ratePrev = rates[rates.length - 2];
  if (rateLatest) {
    const delta = ratePrev ? rateLatest.y10 - ratePrev.y10 : null;
    tiles.push({
      label: "국고채 10년",
      asOf: rateLatest.month,
      value: rateLatest.y10.toFixed(2),
      unit: "%",
      sub:
        delta == null
          ? undefined
          : `전월 대비 ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}bp`,
      spark: tail(rates.map((p) => p.y10)),
    });
  }
  const cancerLatest = cancer.data[cancer.data.length - 1];
  if (cancerLatest) {
    tiles.push({
      label: "암 조발생률",
      asOf: String(cancerLatest.year),
      value: cancerLatest.total.toFixed(0),
      unit: "명/10만",
      // 생존율은 별도 통계표라 우선 근사치로 병기 — 파라미터 검증 후 실데이터 전환
      sub: `5년 상대생존율 ~${DEMO_CANCER_SURVIVAL.rate}% (${DEMO_CANCER_SURVIVAL.period})`,
      spark: tail(cancer.data.map((p) => p.total)),
    });
  }
  const rising = topRisingKeyword(trends);
  if (rising) {
    tiles.push({
      label: "검색 수요 상승 1위",
      asOf: "최근 3개월",
      value: rising.name,
      sub: `${rising.changePct >= 0 ? "+" : ""}${rising.changePct.toFixed(0)}% (직전 3개월 대비)`,
      spark: tail(rising.values),
    });
  }
  return tiles;
}

export async function collectStats(): Promise<StatsResponse> {
  // 키 존재 여부는 호출 시점에 평가 (모듈 로드 시점 고정 방지)
  const kosisOpts: BlockOpts = {
    hasKey: hasKosisKey(),
    noKeyNote: "KOSIS_API_KEY 미설정 — 근사치 예시",
  };
  const dataGoOpts: BlockOpts = {
    hasKey: hasDataGoKrKey(),
    noKeyNote: "DATA_GO_KR_API_KEY 미설정 — 근사치 예시",
  };
  const [
    lifeExpectancy,
    deathCausesRaw,
    treasuryYields,
    frequentDiseases,
    cancerIncidence,
    ageProfile,
    infectious,
    searchTrends,
  ] = await Promise.all([
      block(
        "stats-life-expectancy",
        fetchLifeExpectancy,
        DEMO_LIFE_EXPECTANCY,
        kosisOpts,
      ),
      block(
        "stats-death-causes",
        fetchDeathCauses,
        { year: DEMO_DEATH_CAUSES_YEAR, rows: DEMO_DEATH_CAUSES },
        kosisOpts,
      ),
      block("stats-treasury-yields", fetchTreasuryYields, DEMO_TREASURY_YIELDS, {
        hasKey: hasEcosKey(),
        noKeyNote: "ECOS_API_KEY 미설정 — 근사치 예시",
      }),
      block(
        "stats-frequent-diseases",
        fetchFrequentDiseases,
        DEMO_FREQUENT_DISEASES,
        kosisOpts,
      ),
      block(
        "stats-cancer-incidence",
        fetchCancerIncidence,
        DEMO_CANCER_INCIDENCE,
        kosisOpts,
      ),
      block("stats-age-profile", fetchAgeProfile, DEMO_AGE_PROFILE, dataGoOpts),
      block("stats-infectious", fetchWeeklyInfectious, DEMO_INFECTIOUS, dataGoOpts),
      block("stats-search-trends", fetchSearchTrends, DEMO_SEARCH_TRENDS, {
        hasKey: hasNaverKeys(),
        noKeyNote: "NAVER_CLIENT_ID/SECRET 미설정 — 근사치 예시",
      }),
    ]);

  const deathCauses: StatsBlock<DeathCauseRow[]> = {
    status: deathCausesRaw.status,
    note: deathCausesRaw.note,
    data: deathCausesRaw.data.rows,
  };

  return {
    lifeExpectancy,
    deathCauses,
    deathCausesYear: deathCausesRaw.data.year,
    treasuryYields,
    frequentDiseases,
    cancerIncidence,
    ageProfile,
    infectious,
    searchTrends,
    tiles: buildTiles(
      lifeExpectancy.data,
      deathCauses.data,
      deathCausesRaw.data.year,
      treasuryYields.data,
      cancerIncidence,
      searchTrends.data,
    ),
    generatedAt: new Date().toISOString(),
  };
}
