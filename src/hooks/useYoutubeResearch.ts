"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "./useYoutubeToken";
import type { ResearchReport } from "@/lib/youtube/types";

export interface ResearchResponse extends ResearchReport {
  cacheStatus: "live" | "stale";
}

interface State {
  data: ResearchResponse | null;
  loading: boolean;
  /** POST refresh 진행 중 */
  refreshing: boolean;
  error: string | null;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    // JSON 아님
  }
  return `HTTP ${res.status}`;
}

/** 주제 리서치 리포트 로드(캐시) + 강제 새로고침 */
export function useYoutubeResearch() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/youtube/research", { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as ResearchResponse;
      setState({ data, loading: false, refreshing: false, error: null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "리서치를 불러오지 못했습니다",
      }));
    }
  }, []);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, refreshing: true, error: null }));
    try {
      const res = await fetch("/api/youtube/research", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ refresh: true }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as ResearchResponse;
      setState({ data, loading: false, refreshing: false, error: null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        refreshing: false,
        error: err instanceof Error ? err.message : "리서치 새로고침 실패",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return { ...state, reload: load, refresh };
}
