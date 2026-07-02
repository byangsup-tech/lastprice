import type { Daycare, HistoryEntry } from "./types";

/** 데모 모드 기본 중심: 강남역 */
export const DEFAULT_CENTER = { lat: 37.4979, lng: 127.0276 };

// 시드 고정 의사난수 — 데모 데이터가 실행마다 동일하도록
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = [
  "햇살", "푸른숲", "아이사랑", "꿈나무", "별빛", "하늘", "솔잎", "민들레",
  "참사랑", "예쁜", "동그라미", "무지개", "사랑샘", "은혜", "다정", "보람",
  "초록", "행복한", "예솔", "산들", "노을", "솔샘", "튼튼", "새싹",
  "예원", "한울", "아람", "도담", "소망", "다온", "해맑은", "꿈동산",
  "라온", "이든", "온유", "슬기", "누리", "단비", "푸르미", "씨앗",
];
const GANGNAM_DONGS = ["역삼동", "논현동", "삼성동", "대치동", "청담동", "개포동", "일원동", "수서동", "도곡동", "신사동"];
const SEOCHO_DONGS = ["서초동", "방배동", "잠원동", "반포동", "양재동", "내곡동", "우면동"];

const TYPES: Array<{ type: string; weight: number }> = [
  { type: "가정", weight: 30 },
  { type: "민간", weight: 28 },
  { type: "국공립", weight: 24 },
  { type: "직장", weight: 8 },
  { type: "사회복지법인", weight: 6 },
  { type: "협동", weight: 4 },
];

function pickType(r: number): string {
  const total = TYPES.reduce((s, t) => s + t.weight, 0);
  let acc = 0;
  for (const t of TYPES) {
    acc += t.weight;
    if (r * total < acc) return t.type;
  }
  return "민간";
}

function buildDemoData(): Daycare[] {
  const rand = mulberry32(20260609);
  const list: Daycare[] = [];
  for (let i = 0; i < 84; i++) {
    const type = pickType(rand());
    const inGangnam = rand() < 0.55;
    const sigungu = inGangnam ? "강남구" : "서초구";
    const dongs = inGangnam ? GANGNAM_DONGS : SEOCHO_DONGS;
    const dong = dongs[Math.floor(rand() * dongs.length)];
    const baseName = NAMES[i % NAMES.length];
    const suffix = i >= NAMES.length ? `제${Math.floor(i / NAMES.length) + 1}` : "";
    const name =
      type === "직장"
        ? `${baseName}${suffix} 직장어린이집`
        : `${baseName}${suffix}어린이집`;

    // 강남역 중심으로 반경 약 4km 내 산포
    const lat = DEFAULT_CENTER.lat + (rand() - 0.5) * 0.05;
    const lng = DEFAULT_CENTER.lng + (rand() - 0.5) * 0.07;

    const capacity =
      type === "가정"
        ? 15 + Math.floor(rand() * 6) // 15~20
        : type === "국공립"
          ? 50 + Math.floor(rand() * 60) // 50~109
          : 30 + Math.floor(rand() * 70); // 30~99
    const current = Math.min(
      capacity,
      Math.floor(capacity * (0.55 + rand() * 0.5)),
    );
    const staffCount = Math.max(2, Math.ceil(current / (4 + rand() * 3)) + 1);
    const roomCount = Math.max(2, Math.round(capacity / 15));
    const roomArea = Math.round(roomCount * (25 + rand() * 20));
    const status = rand() < 0.04 ? "휴지" : "정상";

    list.push({
      id: `demo-${String(i + 1).padStart(3, "0")}`,
      name,
      type,
      status,
      address: `서울특별시 ${sigungu} ${dong} ${10 + Math.floor(rand() * 90)}-${1 + Math.floor(rand() * 20)}`,
      tel: `02-${500 + Math.floor(rand() * 500)}-${1000 + Math.floor(rand() * 9000)}`,
      homepage: rand() < 0.3 ? `https://example.com/daycare-${i + 1}` : undefined,
      capacity,
      current,
      staffCount,
      roomCount,
      roomArea,
      playgroundCount: type === "가정" ? 0 : Math.floor(rand() * 3),
      cctvCount: 4 + Math.floor(rand() * 13),
      hasBus: (type === "민간" || type === "사회복지법인") && rand() < 0.6,
      approvedAt: `${2003 + Math.floor(rand() * 21)}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      sido: "서울특별시",
      sigungu,
    });
  }
  return list;
}

export const DEMO_DAYCARES: Daycare[] = buildDemoData();

function isoDaysAgo(daysAgo: number): string {
  const t = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10);
}

/** 데모 모드용 가짜 수집 이력 (~90일) — 실데이터가 쌓이기 전에도 추이 UI를 시연 가능하게 */
export function buildDemoHistory(id: string): HistoryEntry[] {
  const daycare = DEMO_DAYCARES.find((x) => x.id === id);
  if (!daycare) return [];
  const seed = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const rand = mulberry32(seed * 7919 + 11);

  // 현재 값에서 과거로 거슬러 올라가며 변화 지점을 생성
  const points: Array<{ daysAgo: number; c: number; n: number }> = [];
  const c = daycare.capacity;
  let n = daycare.current;
  points.push({ daysAgo: 0, c, n });
  let daysAgo = 0;
  while (daysAgo < 90) {
    daysAgo += 4 + Math.floor(rand() * 14);
    const step = rand() < 0.7 ? 1 : 2;
    n = Math.min(c, Math.max(Math.floor(c * 0.55), n + (rand() < 0.55 ? step : -step)));
    points.push({ daysAgo, c, n });
  }
  return points
    .reverse()
    .map((p) => ({ d: isoDaysAgo(p.daysAgo), c: p.c, n: p.n }));
}
