import { getCached } from "../cache";
import {
  DEMO_DEATH_CAUSES,
  DEMO_DEATH_CAUSES_YEAR,
  DEMO_LIFE_EXPECTANCY,
} from "./demo";
import { fetchDeathCauses, fetchLifeExpectancy, hasKosisKey } from "./kosis";
import type {
  StatsBlock,
  StatsResponse,
  StatTileData,
  LifeExpectancyPoint,
  DeathCauseRow,
} from "./types";

/** 연간 통계라 하루 캐시면 충분 */
const STATS_TTL_MS = 24 * 60 * 60 * 1000;

async function block<T>(
  key: string,
  fetcher: () => Promise<T>,
  demoData: T,
): Promise<StatsBlock<T>> {
  if (!hasKosisKey()) {
    return {
      status: "demo",
      note: "KOSIS_API_KEY 미설정 — 근사치 예시",
      data: demoData,
    };
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
  return tiles;
}

export async function collectStats(): Promise<StatsResponse> {
  const [lifeExpectancy, deathCausesRaw] = await Promise.all([
    block("stats-life-expectancy", fetchLifeExpectancy, DEMO_LIFE_EXPECTANCY),
    block(
      "stats-death-causes",
      fetchDeathCauses,
      { year: DEMO_DEATH_CAUSES_YEAR, rows: DEMO_DEATH_CAUSES },
    ),
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
    tiles: buildTiles(lifeExpectancy.data, deathCauses.data),
    generatedAt: new Date().toISOString(),
  };
}
