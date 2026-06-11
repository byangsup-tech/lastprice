import type { Daycare } from "./types";

/**
 * 어린이집정보공개포털 보육정보공개 API (api.childcare.go.kr)
 * - 시군구 행정구역코드(arcode) 단위 조회, XML 응답
 * - 일 호출 한도(기본 1,000회)가 있어 시군구별 캐싱과 함께 사용해야 한다
 */
const DEFAULT_ENDPOINT =
  "http://api.childcare.go.kr/mediate/rest/cpmsapi021/cpmsapi021/request";

export class OpenApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiError";
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** <item>...</item> (또는 <row>) 블록들의 평면 태그를 객체 배열로 변환 */
export function parseXmlItems(xml: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  let itemRe = /<item>([\s\S]*?)<\/item>/g;
  if (!/<item>/.test(xml) && /<row>/.test(xml)) {
    itemRe = /<row>([\s\S]*?)<\/row>/g;
  }
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const fields: Record<string, string> = {};
    const tagRe = /<([A-Za-z][\w]*)>([\s\S]*?)<\/\1>/g;
    let t: RegExpExecArray | null;
    while ((t = tagRe.exec(m[1])) !== null) {
      let value = t[2].trim();
      const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value);
      if (cdata) value = cdata[1].trim();
      fields[t[1].toLowerCase()] = decodeEntities(value);
    }
    items.push(fields);
  }
  return items;
}

function extractErrorMessage(xml: string): string | null {
  const m =
    /<returnmsg>([\s\S]*?)<\/returnmsg>|<resultmsg>([\s\S]*?)<\/resultmsg>|<message>([\s\S]*?)<\/message>|<errmsg>([\s\S]*?)<\/errmsg>/i.exec(
      xml,
    );
  const msg = (m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4])?.trim();
  return msg && msg !== "정상" && !/^success$/i.test(msg) ? msg : null;
}

function str(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v).trim();
  }
  return "";
}

function num(row: Record<string, string>, ...keys: string[]): number {
  const v = Number(str(row, ...keys).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}

/** API 응답 한 행을 Daycare로 정규화. 위경도 없는/폐지 시설은 제외 */
export function normalizeRow(row: Record<string, string>): Daycare | null {
  const lat = num(row, "la", "lat", "latitude");
  const lng = num(row, "lo", "lng", "longitude");
  const name = str(row, "crname", "fcltnm");
  const status = str(row, "crstatusname", "operstatus") || "정상";
  if (!name || !lat || !lng) return null;
  if (status === "폐지" || status.includes("폐쇄")) return null;

  const address = str(row, "craddr", "rdnmadr", "lnmadr");
  const busValue = str(row, "crcargbname", "schoolbusyn");
  return {
    id: str(row, "stcode", "crcode") || `${name}@${address}`.replace(/\s+/g, ""),
    name,
    type: str(row, "crtypename", "establishmenttype") || "민간",
    status,
    address,
    tel: str(row, "crtelno", "phonenumber"),
    homepage: str(row, "crhome", "homepage") || undefined,
    capacity: num(row, "crcapat", "capacity"),
    current: num(row, "crchcnt", "currentchildcount"),
    staffCount: num(row, "chcrtescnt", "crtescnt", "staffcount"),
    roomCount: num(row, "nrtrroomcnt", "childcareroomcount"),
    roomArea: num(row, "nrtrroomsize", "childcarearea") || undefined,
    playgroundCount: num(row, "plgrdco", "playgroundcount"),
    cctvCount: num(row, "cctvinstlcnt", "cctvcount"),
    hasBus: busValue.includes("운영") && !busValue.includes("미운영")
      ? true
      : busValue.toUpperCase() === "Y",
    approvedAt: str(row, "crcnfmdt", "authorizationdate") || undefined,
    lat,
    lng,
    sido: str(row, "sidoname", "ctprvnnm"),
    sigungu: str(row, "sigunname", "sggname", "signguname"),
  };
}

/** 특정 시군구(arcode)의 어린이집 목록 조회 */
export async function fetchByArcode(
  serviceKey: string,
  arcode: string,
): Promise<Daycare[]> {
  const endpoint = process.env.CHILDCARE_API_ENDPOINT || DEFAULT_ENDPOINT;
  const url = `${endpoint}?key=${encodeURIComponent(serviceKey)}&arcode=${arcode}&stcode=`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) {
    throw new OpenApiError(`HTTP ${res.status}: ${text.slice(0, 150)}`);
  }

  const rows = parseXmlItems(text);
  if (rows.length === 0) {
    const errMsg = extractErrorMessage(text);
    if (errMsg) throw new OpenApiError(`API 오류(arcode=${arcode}): ${errMsg}`);
    return []; // 해당 시군구에 데이터 없음 (정상)
  }

  const daycares: Daycare[] = [];
  for (const row of rows) {
    const d = normalizeRow(row);
    if (d) daycares.push(d);
  }
  return daycares;
}
