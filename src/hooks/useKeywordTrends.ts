"use client";

import { useEffect, useState } from "react";
import type { KeywordTrendsResponse } from "@/lib/insurance/types";

/** 관심 키워드별 검색 수요 트렌드 — 키워드 목록이 바뀔 때만 재조회 */
export function useKeywordTrends(keywords: string[]) {
  const [data, setData] = useState<KeywordTrendsResponse | null>(null);
  const key = keywords.join(",");

  useEffect(() => {
    if (!key) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 키워드 전부 삭제 시 카드 즉시 제거 (외부 상태와 1회 동기화)
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    // 연타 입력 시 요청 폭주 방지
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/insurance/keyword-trends?keywords=${encodeURIComponent(key)}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) return;
        setData((await res.json()) as KeywordTrendsResponse);
      } catch {
        // 무시 — 카드가 안 뜰 뿐 피드는 정상
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  return data;
}
