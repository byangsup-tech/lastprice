import { fetchJson } from "./http";
import type { ParsedFeedItem } from "./rss";

/**
 * DART 전자공시 OpenAPI — 최근 공시 목록에서 보험사 공시만 걸러낸다.
 * https://opendart.fss.or.kr (무료 키, 일 20,000건)
 *
 * corp_code 사전 없이 최근 공시를 회사명 키워드로 필터링하는 단순 방식.
 * 상장 보험사 위주라 유가증권(Y)만 조회한다.
 */

interface DartListResponse {
  status: string;
  message: string;
  list?: {
    corp_name: string;
    report_nm: string;
    rcept_no: string;
    rcept_dt: string; // YYYYMMDD
  }[];
}

/** 공시 회사명에 이 중 하나가 들어가면 보험사로 간주 */
const INSURER_NAME_PATTERNS = [
  "생명",
  "화재",
  "해상",
  "손해보험",
  "보험",
  "코리안리",
];

/** 보험과 무관한데 이름만 걸리는 회사 제외 */
const EXCLUDE_PATTERNS = ["생명과학", "생명공학", "바이오생명"];

export function hasDartKey(): boolean {
  return !!process.env.DART_API_KEY;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchDartInsurerFilings(): Promise<ParsedFeedItem[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const url =
    "https://opendart.fss.or.kr/api/list.json" +
    `?crtfc_key=${process.env.DART_API_KEY}` +
    `&bgn_de=${toDateStr(weekAgo)}&end_de=${toDateStr(now)}` +
    "&corp_cls=Y&page_no=1&page_count=100";
  const data = await fetchJson<DartListResponse>(url);
  if (data.status !== "000" && data.status !== "013") {
    // 013 = 조회 결과 없음
    throw new Error(`DART ${data.status}: ${data.message}`);
  }
  return (data.list ?? [])
    .filter(
      (f) =>
        INSURER_NAME_PATTERNS.some((p) => f.corp_name.includes(p)) &&
        !EXCLUDE_PATTERNS.some((p) => f.corp_name.includes(p)),
    )
    .map((f) => ({
      title: `[${f.corp_name}] ${f.report_nm}`,
      link: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rcept_no}`,
      publishedAt: `${f.rcept_dt.slice(0, 4)}-${f.rcept_dt.slice(4, 6)}-${f.rcept_dt.slice(6, 8)}T09:00:00+09:00`,
    }));
}
