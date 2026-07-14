import { fetchJson } from "../http";
import type { AgeProfileData, InfectiousDiseaseRow } from "./types";

/**
 * 공공데이터포털(data.go.kr) 표준 REST 응답 공용 헬퍼 + 서비스별 매퍼.
 * 인증키 하나(DATA_GO_KR_API_KEY)로 HIRA·질병관리청 서비스를 함께 쓴다.
 *
 * ※ 서비스 경로·필드명은 조사 기반 추정 — 형식이 다르면 예외 → 예시 폴백.
 *   data.go.kr에서 각 API "활용신청 → 참고문서"로 확인 후 아래 상수를 교체할 것.
 */

const BASE = "https://apis.data.go.kr";

/** HIRA 질병정보서비스 — 연령대별 다발생 질병 통계 (활용신청: 15119055) */
const HIRA_AGE_PATH = "/B551182/diseaseInfoService1/getDissAgeStats";
/** 질병관리청 감염병 발생현황 (활용신청: 15139178) */
const KDCA_INFECTIOUS_PATH = "/1352159/InfectiousDiseaseStatistics/getWeeklyStats";

export function hasDataGoKrKey(): boolean {
  return !!process.env.DATA_GO_KR_API_KEY;
}

/** data.go.kr 표준 응답 형태: response.header.resultCode + response.body.items.item[] */
interface DataGoResponse<T> {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: T[] } | T[] };
  };
}

export async function fetchDataGoItems<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const qs = new URLSearchParams({
    serviceKey: process.env.DATA_GO_KR_API_KEY!,
    _type: "json",
    numOfRows: "100",
    pageNo: "1",
    ...params,
  });
  const data = await fetchJson<DataGoResponse<T>>(
    `${BASE}${path}?${qs.toString()}`,
    {},
    12000,
  );
  const header = data.response?.header;
  if (header?.resultCode && header.resultCode !== "00") {
    throw new Error(`data.go.kr ${header.resultCode}: ${header.resultMsg ?? ""}`);
  }
  const items = data.response?.body?.items;
  const list = Array.isArray(items) ? items : (items?.item ?? []);
  if (!Array.isArray(list)) {
    throw new Error("data.go.kr 응답 형식 오류 — items 배열 없음");
  }
  return list;
}

/** 연령 구간 정렬 순서 (HIRA 응답의 연령 표기를 정규화) */
const AGE_BANDS = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60–69", "70–79", "80+"];

function normalizeAgeBand(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})/);
  if (!m) return null;
  const start = Number(m[1]);
  if (start >= 80) return "80+";
  const idx = Math.floor(start / 10);
  return AGE_BANDS[idx] ?? null;
}

interface HiraAgeItem {
  /** 상병명 */
  sickNm?: string;
  /** 연령 구간 (예: "30~39세") */
  agrdeNm?: string;
  /** 환자수 */
  ptntCnt?: number | string;
}

/** 관심 질환군 — 위험률 발생 곡선을 보는 대상 */
const TARGET_DISEASES = [
  { name: "악성신생물(암)", re: /악성|신생물|암/ },
  { name: "심장 질환", re: /심장|허혈/ },
  { name: "뇌혈관 질환", re: /뇌혈관|뇌졸중/ },
];

export async function fetchAgeProfile(): Promise<AgeProfileData> {
  const items = await fetchDataGoItems<HiraAgeItem>(HIRA_AGE_PATH, {
    numOfRows: "500",
  });

  const series = TARGET_DISEASES.map((d) => ({
    name: d.name,
    values: AGE_BANDS.map(() => 0),
  }));
  let matched = 0;
  for (const item of items) {
    const disease = TARGET_DISEASES.findIndex((d) => d.re.test(item.sickNm ?? ""));
    const band = normalizeAgeBand(item.agrdeNm ?? "");
    const count = Number(item.ptntCnt);
    if (disease < 0 || !band || !Number.isFinite(count)) continue;
    const bandIdx = AGE_BANDS.indexOf(band);
    series[disease].values[bandIdx] += count / 10000; // 만 명 단위
    matched++;
  }
  if (matched < 10) {
    throw new Error("HIRA 연령별 통계 파싱 실패 — 서비스 경로/필드명 확인 필요");
  }
  return { ageBands: AGE_BANDS, series };
}

interface KdcaItem {
  /** 감염병명 */
  dissNm?: string;
  /** 주간 신고 건수 */
  weekCnt?: number | string;
}

export async function fetchWeeklyInfectious(): Promise<InfectiousDiseaseRow[]> {
  const items = await fetchDataGoItems<KdcaItem>(KDCA_INFECTIOUS_PATH, {});
  const rows = items
    .map((it) => ({
      disease: (it.dissNm ?? "").trim(),
      weeklyCases: Number(it.weekCnt),
    }))
    .filter((r) => r.disease && Number.isFinite(r.weeklyCases) && r.weeklyCases > 0)
    .sort((a, b) => b.weeklyCases - a.weeklyCases)
    .slice(0, 5);
  if (rows.length < 3) {
    throw new Error("감염병 주간 통계 파싱 실패 — 서비스 경로/필드명 확인 필요");
  }
  return rows;
}
