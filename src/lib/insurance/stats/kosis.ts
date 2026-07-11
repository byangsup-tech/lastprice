import { fetchJson } from "../http";
import type { DeathCauseRow, LifeExpectancyPoint } from "./types";

/**
 * KOSIS 국가통계포털 공유서비스 (통계자료 파라미터 방식).
 * https://kosis.kr/openapi — 무료 키, 회원가입 후 자동승인.
 *
 * ※ tblId/itmId/objL 파라미터는 조사 자료 기반 추정값으로 실환경 검증 전.
 *   KOSIS 사이트에서 원하는 통계표를 연 뒤 "Open API → 자료 URL 생성"으로
 *   정확한 파라미터를 확인해 아래 상수를 교체할 것.
 *   파싱은 방어적으로 작성되어 형식이 다르면 예외 → 예시 데이터 폴백.
 */

const BASE = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

/** 완전생명표 — 0세 기대여명 (통계청, orgId 101) */
const LIFE_TABLE = { orgId: "101", tblId: "DT_1B41" };
/** 사망원인통계 — 사망원인(103항목)별 사망률 (통계청, orgId 101) */
const DEATH_CAUSE_TABLE = { orgId: "101", tblId: "DT_1B34E01" };

interface KosisRow {
  PRD_DE?: string; // 수록시점 (연도)
  ITM_NM?: string; // 항목명
  C1_NM?: string; // 분류1명
  C2_NM?: string; // 분류2명
  DT?: string; // 수치
  UNIT_NM?: string;
}

export function hasKosisKey(): boolean {
  return !!process.env.KOSIS_API_KEY;
}

async function fetchKosis(
  params: Record<string, string>,
): Promise<KosisRow[]> {
  const qs = new URLSearchParams({
    method: "getList",
    apiKey: process.env.KOSIS_API_KEY!,
    format: "json",
    jsonVD: "Y",
    prdSe: "Y",
    ...params,
  });
  const data = await fetchJson<KosisRow[] | { err: string; errMsg?: string }>(
    `${BASE}?${qs.toString()}`,
    {},
    12000,
  );
  if (!Array.isArray(data)) {
    throw new Error(`KOSIS 오류: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}

function genderOf(row: KosisRow): "total" | "male" | "female" | null {
  const label = `${row.C1_NM ?? ""} ${row.C2_NM ?? ""} ${row.ITM_NM ?? ""}`;
  if (/남/.test(label)) return "male";
  if (/여/.test(label)) return "female";
  if (/전체|계|합계/.test(label)) return "total";
  return null;
}

export async function fetchLifeExpectancy(): Promise<LifeExpectancyPoint[]> {
  const endYear = new Date().getFullYear() - 1;
  const rows = await fetchKosis({
    ...LIFE_TABLE,
    // 0세 기대여명 — objL 파라미터는 실환경에서 검증 필요
    itmId: "ALL",
    objL1: "ALL",
    startPrdDe: "2000",
    endPrdDe: String(endYear),
  });

  const byYear = new Map<number, Partial<LifeExpectancyPoint>>();
  for (const row of rows) {
    const year = Number(row.PRD_DE);
    const value = Number(row.DT);
    const gender = genderOf(row);
    if (!Number.isFinite(year) || !Number.isFinite(value) || !gender) continue;
    // 기대여명은 60~95 범위 밖이면 다른 항목(0세 아님)으로 간주하고 버린다
    if (value < 60 || value > 95) continue;
    const point = byYear.get(year) ?? { year };
    point[gender] = value;
    byYear.set(year, point);
  }

  const points = [...byYear.values()]
    .filter(
      (p): p is LifeExpectancyPoint =>
        p.total != null && p.male != null && p.female != null,
    )
    .sort((a, b) => a.year - b.year);

  if (points.length < 3) {
    throw new Error("생명표 응답 파싱 실패 — 테이블 파라미터 확인 필요");
  }
  return points;
}

export async function fetchDeathCauses(): Promise<{
  year: number;
  rows: DeathCauseRow[];
}> {
  const endYear = new Date().getFullYear() - 1;
  const raw = await fetchKosis({
    ...DEATH_CAUSE_TABLE,
    itmId: "ALL",
    objL1: "ALL",
    startPrdDe: String(endYear - 1),
    endPrdDe: String(endYear),
  });

  // 최신 연도의 "사망률" 항목 + 전체 성별만
  const years = raw
    .map((r) => Number(r.PRD_DE))
    .filter((y) => Number.isFinite(y));
  const latest = Math.max(...years);
  const rows = raw
    .filter(
      (r) =>
        Number(r.PRD_DE) === latest &&
        /사망률/.test(r.ITM_NM ?? "") &&
        !/남|여/.test(r.C2_NM ?? ""),
    )
    .map((r) => ({
      cause: (r.C1_NM ?? "").trim(),
      ratePer100k: Number(r.DT),
    }))
    .filter(
      (r) =>
        r.cause &&
        Number.isFinite(r.ratePer100k) &&
        !/전체|합계|총|모든/.test(r.cause),
    )
    .sort((a, b) => b.ratePer100k - a.ratePer100k)
    .slice(0, 10);

  if (rows.length < 5) {
    throw new Error("사망원인 응답 파싱 실패 — 테이블 파라미터 확인 필요");
  }
  return { year: latest, rows };
}
