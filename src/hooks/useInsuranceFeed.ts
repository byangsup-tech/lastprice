"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedResponse } from "@/lib/insurance/types";

interface State {
  data: FeedResponse | null;
  loading: boolean;
  error: string | null;
}

/** 피드 로드 + 10분 간격 자동 갱신 */
export function useInsuranceFeed() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/insurance/feed", { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as FeedResponse;
      setState({ data, loading: false, error: null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "피드를 불러오지 못했습니다",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  return { ...state, reload: load };
}
