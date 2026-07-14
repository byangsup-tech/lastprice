import { fetchJson } from "../http";
import type { InterestRatePoint } from "./types";

/**
 * 한국은행 ECOS 오픈API — 시장금리(월) 통계표에서 국고채 3/5/10년 수익률.
 * https://ecos.bok.or.kr/api (무료 키, 회원가입 시 자동 발급)
 *
 * 통계표 721Y001(시장금리, 월). 항목 코드가 개편될 수 있어 코드가 아닌
 * ITEM_NAME1 정규식으로 시리즈를 매칭한다 — 형식이 다르면 예외 → 예시 폴백.
 */

const BASE = "https://ecos.bok.or.kr/api/StatisticSearch";
const TABLE = "721Y001";
/** 조회 기간(월) — row 1,000건 상한 보호 겸 차트 표시 범위 */
const MONTHS_BACK = 36;

const SERIES_PATTERNS: { key: keyof Omit<InterestRatePoint, "month">; re: RegExp }[] = [
  { key: "y3", re: /국고채.*3년/ },
  { key: "y5", re: /국고채.*5년/ },
  { key: "y10", re: /국고채.*10년/ },
];

interface EcosRow {
  TIME?: string; // YYYYMM
  ITEM_NAME1?: string;
  DATA_VALUE?: string;
}

interface EcosResponse {
  StatisticSearch?: { row?: EcosRow[] };
  RESULT?: { CODE?: string; MESSAGE?: string };
}

export function hasEcosKey(): boolean {
  return !!process.env.ECOS_API_KEY;
}

function yyyymm(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function fetchTreasuryYields(): Promise<InterestRatePoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
  const url =
    `${BASE}/${process.env.ECOS_API_KEY}/json/kr/1/1000/${TABLE}/M/` +
    `${yyyymm(start)}/${yyyymm(now)}`;
  const data = await fetchJson<EcosResponse>(url, {}, 12000);
  if (data.RESULT) {
    throw new Error(`ECOS ${data.RESULT.CODE}: ${data.RESULT.MESSAGE}`);
  }

  const byMonth = new Map<string, Partial<InterestRatePoint>>();
  for (const row of data.StatisticSearch?.row ?? []) {
    const series = SERIES_PATTERNS.find((p) => p.re.test(row.ITEM_NAME1 ?? ""));
    if (!series || !row.TIME || row.TIME.length !== 6) continue;
    const value = Number(row.DATA_VALUE);
    if (!Number.isFinite(value)) continue;
    const month = `${row.TIME.slice(0, 4)}-${row.TIME.slice(4, 6)}`;
    const point = byMonth.get(month) ?? { month };
    point[series.key] = value;
    byMonth.set(month, point);
  }

  // 3개 시리즈가 모두 있는 월만 채택
  const points = [...byMonth.values()]
    .filter(
      (p): p is InterestRatePoint =>
        p.y3 != null && p.y5 != null && p.y10 != null,
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  if (points.length < 12) {
    throw new Error("ECOS 응답 파싱 실패 — 통계표/항목명 확인 필요");
  }
  return points;
}
