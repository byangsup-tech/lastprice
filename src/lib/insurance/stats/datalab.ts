import { fetchJson } from "../http";
import { hasNaverKeys } from "../naver";
import type { SearchTrendData } from "./types";

/**
 * 네이버 데이터랩 — 통합 검색어 트렌드 API.
 * https://developers.naver.com/docs/serviceapi/datalab/search/datalab.search.md
 *
 * 뉴스 검색과 같은 네이버 앱 키(Client ID/Secret)를 재사용한다 (일 1,000회).
 * 응답 ratio는 조회 기간·그룹 내 최대 검색량을 100으로 한 상대지수 —
 * 그룹 간 비교는 같은 호출 안에서만 유효하다.
 *
 * 디지털 채널 신상품 아이디에이션용: 상품 키워드의 검색 수요 추이 비교.
 * 키워드는 DATALAB_KEYWORDS(쉼표 구분, 최대 5개)로 교체 가능.
 */

const ENDPOINT = "https://openapi.naver.com/v1/datalab/search";
/** 데이터랩 요청당 키워드 그룹 최대 개수 */
const MAX_GROUPS = 5;
const MONTHS_BACK = 24;

const DEFAULT_KEYWORDS = [
  "펫보험",
  "치아보험",
  "운전자보험",
  "여행자보험",
  "암보험",
];

export { hasNaverKeys };

export function datalabKeywords(): string[] {
  const raw = process.env.DATALAB_KEYWORDS;
  const list = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_KEYWORDS;
  return list.slice(0, MAX_GROUPS);
}

interface DatalabResponse {
  results?: {
    title?: string;
    data?: { period?: string; ratio?: number }[];
  }[];
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 최근 3개월 평균 vs 직전 3개월 평균 변화율(%) — 6개 미만이면 null */
export function recentChangePct(values: number[]): number | null {
  const n = values.length;
  if (n < 6) return null;
  const recent = (values[n - 1] + values[n - 2] + values[n - 3]) / 3;
  const prior = (values[n - 4] + values[n - 5] + values[n - 6]) / 3;
  if (prior <= 0) return null;
  return ((recent - prior) / prior) * 100;
}

/**
 * 키 없는 환경용 결정적(키워드 해시 시드) 합성 트렌드 — UI 확인 전용 예시.
 * 같은 키워드는 항상 같은 곡선을 만든다.
 */
export function syntheticTrend(keyword: string, months = 12): number[] {
  let h = 2166136261;
  for (let i = 0; i < keyword.length; i++) {
    h = ((h ^ keyword.charCodeAt(i)) * 16777619) >>> 0;
  }
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  let v = 35 + rand() * 30;
  const drift = (rand() - 0.35) * 4;
  const values: number[] = [];
  for (let i = 0; i < months; i++) {
    v = Math.min(100, Math.max(5, v + drift + (rand() - 0.5) * 8));
    values.push(Math.round(v));
  }
  return values;
}

export async function fetchSearchTrends(
  keywordList?: string[],
): Promise<SearchTrendData> {
  const keywords = (keywordList ?? datalabKeywords()).slice(0, MAX_GROUPS);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
  const body = {
    startDate: ymd(start),
    endDate: ymd(now),
    timeUnit: "month",
    keywordGroups: keywords.map((k) => ({ groupName: k, keywords: [k] })),
  };
  const data = await fetchJson<DatalabResponse>(
    ENDPOINT,
    {
      method: "POST",
      headers: {
        "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
        "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    12000,
  );

  const results = data.results ?? [];
  if (results.length !== keywords.length) {
    throw new Error(
      `데이터랩 응답 그룹 수 불일치 (${results.length}/${keywords.length})`,
    );
  }

  // 월 축은 모든 그룹의 period 합집합 (진행 중인 이번 달은 부분 집계라 제외)
  const currentMonth = ymd(now).slice(0, 7);
  const monthSet = new Set<string>();
  for (const r of results) {
    for (const d of r.data ?? []) {
      const month = d.period?.slice(0, 7);
      if (month && month !== currentMonth) monthSet.add(month);
    }
  }
  const months = [...monthSet].sort();
  if (months.length < 6) {
    throw new Error("데이터랩 응답 파싱 실패 — 기간/형식 확인 필요");
  }

  const series = results.map((r, i) => {
    const byMonth = new Map(
      (r.data ?? []).map((d) => [d.period?.slice(0, 7), d.ratio] as const),
    );
    return {
      name: r.title || keywords[i],
      values: months.map((m) => {
        const v = Number(byMonth.get(m));
        return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
      }),
    };
  });

  return { months, series };
}
