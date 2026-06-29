/**
 * "싸다/비싸다" 판정 휴리스틱 (투자자문 아님).
 *
 * 초기 양자기업은 흑자 전 단계라 PER이 무의미하므로, 주가매출비율(P/S)을
 * 매출 성장률로 보정한 "성장 보정 P/S"를 핵심 지표로 쓴다.
 *   성장보정P/S = P/S / max(매출성장률, 0.05)
 * 값이 낮을수록 성장 대비 저렴. 동종(피어) 중앙값 대비 상대 평가한다.
 */
import type { Quote } from "./quantum-quotes";

export type Verdict = "저평가" | "적정" | "고평가" | "N/A";

export interface ValuationItem {
  ticker: string;
  /** 성장 보정 P/S (낮을수록 저렴). 데이터 부족 시 null */
  gaPS: number | null;
  verdict: Verdict;
}

function median(nums: number[]): number {
  if (nums.length === 0) return NaN;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function growthAdjustedPS(q: Quote): number | null {
  if (q.priceToSales == null || q.priceToSales <= 0) return null;
  const g = q.revenueGrowth == null ? 0 : q.revenueGrowth;
  return q.priceToSales / Math.max(g, 0.05);
}

/** 피어 중앙값 대비 저평가/적정/고평가 판정 */
export function valuateAll(quotes: Quote[]): Map<string, ValuationItem> {
  const gaps = new Map<string, number | null>();
  for (const q of quotes) gaps.set(q.ticker, growthAdjustedPS(q));

  const valid = [...gaps.values()].filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  const med = median(valid);

  const out = new Map<string, ValuationItem>();
  for (const q of quotes) {
    const gaPS = gaps.get(q.ticker) ?? null;
    let verdict: Verdict = "N/A";
    if (gaPS != null && Number.isFinite(med)) {
      if (gaPS <= med * 0.7) verdict = "저평가";
      else if (gaPS >= med * 1.4) verdict = "고평가";
      else verdict = "적정";
    }
    out.set(q.ticker, { ticker: q.ticker, gaPS, verdict });
  }
  return out;
}

export const VERDICT_CLASS: Record<Verdict, string> = {
  저평가: "bg-green-100 text-green-700",
  적정: "bg-gray-100 text-gray-600",
  고평가: "bg-red-100 text-red-700",
  "N/A": "bg-gray-50 text-gray-400",
};
