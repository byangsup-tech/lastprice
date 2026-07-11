import { fetchJson } from "./http";
import type { ParsedFeedItem } from "./rss";

/**
 * 열린국회정보 Open API — 국회의원 발의법률안에서 '보험' 키워드 의안 추적.
 * https://open.assembly.go.kr (무료 키, 회원가입 후 발급)
 *
 * 보험업법 등 개정안은 시행 6개월~수년 전의 선행 신호 — 상품개발 리드타임 확보용.
 * 서비스 코드 nzmimeepazxkubdpn = 발의법률안. Type=json 누락 시 XML이 오므로 주의.
 */

/** 대수(AGE)는 2024.5월 개원한 22대 기준 — 차기 국회 개원 시 갱신 필요 */
const ASSEMBLY_AGE = "22";
const BILL_KEYWORD = "보험";

interface AssemblyRow {
  BILL_ID?: string;
  BILL_NAME?: string;
  PROPOSER?: string;
  PROPOSE_DT?: string; // YYYY-MM-DD
  DETAIL_LINK?: string;
  PROC_RESULT_CD?: string;
}

/** 응답 형태: { nzmimeepazxkubdpn: [ { head: [...] }, { row: [...] } ] } 또는 { RESULT: {...} } */
interface AssemblyResponse {
  nzmimeepazxkubdpn?: [
    { head?: { RESULT?: { CODE?: string; MESSAGE?: string } }[] },
    { row?: AssemblyRow[] },
  ];
  RESULT?: { CODE?: string; MESSAGE?: string };
}

export function hasAssemblyKey(): boolean {
  return !!process.env.ASSEMBLY_API_KEY;
}

/** 응답 파싱 (순수 함수 — 픽스처 테스트 대상). 결과 없음(INFO-200)은 빈 배열. */
export function parseAssemblyResponse(
  data: AssemblyResponse,
): ParsedFeedItem[] {
  const topCode = data.RESULT?.CODE ?? "";
  if (topCode.startsWith("INFO-200")) return [];
  if (topCode && !topCode.startsWith("INFO-000")) {
    throw new Error(`열린국회정보 ${topCode}: ${data.RESULT?.MESSAGE ?? ""}`);
  }
  const rows = data.nzmimeepazxkubdpn?.[1]?.row ?? [];
  return rows
    .filter((r) => r.BILL_NAME)
    .map((r) => {
      const status = r.PROC_RESULT_CD ? ` (${r.PROC_RESULT_CD})` : "";
      const t = r.PROPOSE_DT ? Date.parse(`${r.PROPOSE_DT}T09:00:00+09:00`) : NaN;
      return {
        title: `[의안] ${r.BILL_NAME}${status} — ${r.PROPOSER ?? ""}`,
        link:
          r.DETAIL_LINK ||
          `https://likms.assembly.go.kr/bill/billDetail.do?billId=${r.BILL_ID ?? ""}`,
        publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
      };
    });
}

export async function fetchInsuranceBills(): Promise<ParsedFeedItem[]> {
  const url =
    "https://open.assembly.go.kr/portal/openapi/nzmimeepazxkubdpn" +
    `?KEY=${process.env.ASSEMBLY_API_KEY}&Type=json&pIndex=1&pSize=30` +
    `&AGE=${ASSEMBLY_AGE}&BILL_NAME=${encodeURIComponent(BILL_KEYWORD)}`;
  return parseAssemblyResponse(await fetchJson<AssemblyResponse>(url));
}
