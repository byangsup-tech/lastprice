"use client";

import { useEffect, useState } from "react";
import type { StatsResponse } from "@/lib/insurance/stats/types";

interface State {
  data: StatsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useInsuranceStats() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/insurance/stats", {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as StatsResponse;
        setState({ data, loading: false, error: null });
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setState({
          data: null,
          loading: false,
          error:
            err instanceof Error ? err.message : "통계를 불러오지 못했습니다",
        });
      }
    })();
    return () => ctrl.abort();
  }, []);

  return state;
}
