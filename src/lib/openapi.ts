import type { Daycare } from "./types";

/** 한국사회보장정보원 전국 어린이집 정보 조회 (data.go.kr 15101155) */
const ENDPOINT = "https://api.data.go.kr/openapi/tn_pubr_public_child_house_api";
const PAGE_SIZE = 1000;

export class OpenApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiError";
  }
}

/** data.go.kr 발급 키는 이미 URL 인코딩된 형태(%2B 등)인 경우가 많아 이중 인코딩을 피한다 */
function encodeServiceKey(key: string): string {
  return key.includes("%") ? key : encodeURIComponent(key);
}

type RawRow = Record<string, unknown>;

function lowerKeys(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
  return out;
}

function str(row: RawRow, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "")
      return String(v).trim();
  }
  return "";
}

function num(row: RawRow, ...keys: string[]): number {
  const v = Number(str(row, ...keys));
  return Number.isFinite(v) ? v : 0;
}

/** data.go.kr 응답 필드명 변형(crname/CRNAME, items/items.item)에 방어적으로 대응 */
export function normalizeRow(raw: RawRow): Daycare | null {
  const row = lowerKeys(raw);
  const lat = num(row, "latitude", "lat", "la");
  const lng = num(row, "longitude", "lng", "lo");
  const name = str(row, "crname", "fcltnm", "bizplcnm");
  const status = str(row, "crstatusname", "operstatus") || "정상";
  if (!name || !lat || !lng) return null;
  if (status === "폐지" || status.includes("폐쇄")) return null;

  const address = str(row, "craddr", "rdnmadr", "lnmadr");
  return {
    id:
      str(row, "crcode", "stcode") ||
      `${name}@${address}`.replace(/\s+/g, ""),
    name,
    type: str(row, "crtypename", "establishmenttype") || "민간",
    status,
    address,
    tel: str(row, "crtelno", "phonenumber"),
    homepage: str(row, "crhome", "homepage") || undefined,
    capacity: num(row, "crcapat", "capacity"),
    current: num(row, "crchcnt", "currentchildcount"),
    staffCount: num(row, "crtescnt", "chcrtescnt", "staffcount"),
    roomCount: num(row, "nrtrroomcnt", "childcareroomcount"),
    roomArea: num(row, "nrtrroomsize", "childcarearea") || undefined,
    playgroundCount: num(row, "plgrdco", "playgroundcount"),
    cctvCount: num(row, "cctvinstlcnt", "cctvcount"),
    hasBus: str(row, "crcargbname", "schoolbusyn").includes("운영") ||
      str(row, "crcargbname", "schoolbusyn").toUpperCase() === "Y",
    approvedAt: str(row, "crcnfmdt", "authorizationdate") || undefined,
    lat,
    lng,
    sido: str(row, "sidoname", "ctprvnnm"),
    sigungu: str(row, "sggname", "signguname", "signgunm"),
  };
}

interface PageResult {
  rows: RawRow[];
  totalCount: number;
}

async function fetchPage(serviceKey: string, pageNo: number): Promise<PageResult> {
  const url =
    `${ENDPOINT}?serviceKey=${encodeServiceKey(serviceKey)}` +
    `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();

  // 키 오류 등은 json 요청에도 XML 본문으로 반환됨
  if (text.trimStart().startsWith("<")) {
    const msg =
      /<returnAuthMsg>([^<]+)<\/returnAuthMsg>|<errMsg>([^<]+)<\/errMsg>/.exec(
        text,
      );
    throw new OpenApiError(
      `data.go.kr 오류 응답: ${msg?.[1] ?? msg?.[2] ?? text.slice(0, 200)}`,
    );
  }

  let json: RawRow;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OpenApiError(`JSON 파싱 실패: ${text.slice(0, 200)}`);
  }

  const response = (json.response ?? json) as RawRow;
  const header = response.header as RawRow | undefined;
  const resultCode = header ? String(header.resultCode ?? "") : "";
  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    throw new OpenApiError(
      `API 오류 (${resultCode}): ${String(header?.resultMsg ?? "")}`,
    );
  }

  const body = (response.body ?? {}) as RawRow;
  const itemsRaw = body.items;
  let rows: RawRow[] = [];
  if (Array.isArray(itemsRaw)) rows = itemsRaw as RawRow[];
  else if (itemsRaw && typeof itemsRaw === "object") {
    const inner = (itemsRaw as RawRow).item;
    if (Array.isArray(inner)) rows = inner as RawRow[];
    else if (inner) rows = [inner as RawRow];
  }
  return { rows, totalCount: Number(body.totalCount) || rows.length };
}

/** 전체 페이지를 순회하며 전국 어린이집 데이터를 수집 */
export async function fetchAllDaycares(serviceKey: string): Promise<Daycare[]> {
  const first = await fetchPage(serviceKey, 1);
  const totalPages = Math.max(1, Math.ceil(first.totalCount / PAGE_SIZE));
  const allRows = [...first.rows];

  // data.go.kr 트래픽 제한을 고려해 동시 요청 2개로 제한
  const CONCURRENCY = 2;
  for (let p = 2; p <= totalPages; p += CONCURRENCY) {
    const batch = [];
    for (let i = p; i < p + CONCURRENCY && i <= totalPages; i++) {
      batch.push(fetchPage(serviceKey, i));
    }
    const results = await Promise.all(batch);
    for (const r of results) allRows.push(...r.rows);
  }

  const daycares: Daycare[] = [];
  const seen = new Set<string>();
  for (const raw of allRows) {
    const d = normalizeRow(raw);
    if (!d || seen.has(d.id)) continue;
    seen.add(d.id);
    daycares.push(d);
  }
  if (daycares.length === 0)
    throw new OpenApiError("API 응답에서 유효한 어린이집 데이터를 찾지 못했습니다");
  return daycares;
}
