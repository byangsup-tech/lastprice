import type { HistoryEntry, TrendMetrics } from "./types";

const WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) /
      MS_PER_DAY,
  );
}

/**
 * 수집 이력에서 대기 가능성 간접 지표를 계산.
 * - 자리 발생 = 현원 감소분에서 정원 축소분을 뺀 값(반 폐쇄 등 구조 변화 제외)
 * - 공시 데이터가 배치로 갱신되므로 실제 회전율의 하한선임
 */
export function computeTrend(
  entries: HistoryEntry[],
  currentAvail: number,
): TrendMetrics {
  const sorted = [...entries].sort((a, b) => (a.d < b.d ? -1 : 1));

  // 최근 90일 창: 창 밖 마지막 지점 하나는 기준점으로 유지
  const last = sorted[sorted.length - 1];
  let window = sorted;
  if (last) {
    const startIdx = sorted.findIndex((e) => daysBetween(e.d, last.d) <= WINDOW_DAYS);
    if (startIdx > 0) window = sorted.slice(startIdx - 1);
  }

  const daysObserved =
    sorted.length >= 2 ? Math.max(1, daysBetween(sorted[0].d, last.d)) : sorted.length;

  let openings = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1];
    const cur = window[i];
    const capacityDrop = Math.max(0, prev.c - cur.c);
    openings += Math.max(0, prev.n - cur.n - capacityDrop);
  }
  const windowDays =
    window.length >= 2
      ? Math.max(1, daysBetween(window[0].d, window[window.length - 1].d))
      : 0;
  const monthlySlotOpenings =
    windowDays > 0 ? Math.round((openings / windowDays) * 30 * 10) / 10 : 0;

  const availDelta90d =
    window.length >= 2
      ? (window[window.length - 1].c - window[window.length - 1].n) -
        (window[0].c - window[0].n)
      : null;

  let summaryLabel: string;
  if (currentAvail > 0) {
    summaryLabel = "지금 정원 여유 있음";
  } else if (daysObserved < 14) {
    summaryLabel = `데이터 수집 중 (${Math.max(1, daysObserved)}일차)`;
  } else if (monthlySlotOpenings >= 2) {
    summaryLabel = "자리 회전이 빠른 편";
  } else if (monthlySlotOpenings >= 0.5) {
    summaryLabel = "대기가 보통";
  } else {
    summaryLabel = "대기가 길 수 있음";
  }

  return { monthlySlotOpenings, availDelta90d, daysObserved, summaryLabel };
}
