"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EnvStatus } from "@/lib/youtube/types";

interface State {
  data: EnvStatus | null;
  loading: boolean;
  error: string | null;
}

/** 환경·도구 상태 (/api/youtube/status) — 비밀 값 없음 */
export function useYoutubeStatus() {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/youtube/status", { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EnvStatus;
      setState({ data, loading: false, error: null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "환경 상태를 불러오지 못했습니다",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return { ...state, reload: load };
}
