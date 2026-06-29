"use client";

import { useEffect, useState } from "react";
import type { HistoryResult } from "@/lib/quantum-quotes";

/** 단일 종목 시계열을 range(1y/5y)별로 불러온다. */
export function useHistory(ticker: string, range: string) {
  const [data, setData] = useState<HistoryResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticker) return;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/quantum/history?ticker=${encodeURIComponent(ticker)}&range=${range}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("시계열 조회 실패");
        setData(await res.json());
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [ticker, range]);

  return { data, loading };
}
