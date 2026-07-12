import { getCached } from "../cache";
import {
  fetchAgeProfile,
  fetchWeeklyInfectious,
  hasDataGoKrKey,
} from "./datago";
import {
  DEMO_AGE_PROFILE,
  DEMO_CANCER_INCIDENCE,
  DEMO_CANCER_SURVIVAL,
  DEMO_DEATH_CAUSES,
  DEMO_DEATH_CAUSES_YEAR,
  DEMO_FREQUENT_DISEASES,
  DEMO_INFECTIOUS,
  DEMO_LIFE_EXPECTANCY,
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

function buildTiles(
  life: LifeExpectancyPoint[],
  causes: DeathCauseRow[],
  rates: InterestRatePoint[],
  cancer: StatsBlock<CancerIncidencePoint[]>,
): StatTileData[] {
  const tiles: StatTileData[] = [];
  const latest = life[life.length - 1];
  const prev = life[life.length - 2];
  if (latest) {
    const delta = prev ? latest.total - prev.total : null;
    tiles.push({
      label: `기대수명 (${latest.year})`,
      value: latest.total.toFixed(1),
      unit: "세",
      sub:
        delta == null
          ? undefined
          : `전기 대비 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}세`,
    });
    tiles.push({
      label: "남녀 기대수명 차이",
      value: (latest.female - latest.male).toFixed(1),
      unit: "년",
      sub: `남 ${latest.male.toFixed(1)} · 여 ${latest.female.toFixed(1)}`,
    });
  }
  if (causes[0]) {
    tiles.push({
      label: "사망원인 1위",
      value: causes[0].cause,
      sub: `10만 명당 ${causes[0].ratePer100k.toFixed(1)}명`,
    });
  }
  const rateLatest = rates[rates.length - 1];
  const ratePrev = rates[rates.length - 2];
  if (rateLatest) {
    const delta = ratePrev ? rateLatest.y10 - ratePrev.y10 : null;
    tiles.push({
      label: `국고채 10년 (${rateLatest.month})`,
      value: rateLatest.y10.toFixed(2),
      unit: "%",
      sub:
        delta == null
          ? undefined
          : `전월 대비 ${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(0)}bp`,
    });
  }
  const cancerLatest = cancer.data[cancer.data.length - 1];
  if (cancerLatest) {
    tiles.push({
      label: `암 조발생률 (${cancerLatest.year})`,
      value: cancerLatest.total.toFixed(0),
      unit: "명/10만",
      // 생존율은 별도 통계표라 우선 근사치로 병기 — 파라미터 검증 후 실데이터 전환
      sub: `5년 상대생존율 ~${DEMO_CANCER_SURVIVAL.rate}% (${DEMO_CANCER_SURVIVAL.period})`,
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
    tiles: buildTiles(
      lifeExpectancy.data,
      deathCauses.data,
      treasuryYields.data,
      cancerIncidence,
    ),
    generatedAt: new Date().toISOString(),
  };
}
