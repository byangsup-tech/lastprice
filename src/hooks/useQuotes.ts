"use client";

import { useEffect, useState } from "react";
import type { QuotesResult } from "@/lib/quantum-quotes";

/**
 * 순수 양자 상장사 시세를 불러온다. pollMs 지정 시 주기적으로 갱신해
 * "현재 시총을 항상 표시"한다. (useDaycares 패턴)
 */
export function useQuotes(pollMs = 60000) {
  const [data, setData] = useState<QuotesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/quantum/quotes", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("시세를 불러오지 못했습니다");
        setData(await res.json());
        setError(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      } finally {
        setLoading(false);
      }
      if (pollMs > 0) timer = setTimeout(load, pollMs);
    };

    load();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [pollMs]);

  return { data, loading, error };
}
