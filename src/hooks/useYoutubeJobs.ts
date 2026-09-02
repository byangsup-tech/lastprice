"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authHeaders } from "./useYoutubeToken";
import type { Job, JobSummary, Privacy, VisualMode } from "@/lib/youtube/types";

export interface CreateJobInput {
  candidateId?: string;
  topic?: { title: string; angle?: string; keywords?: string[] };
  options?: { upload?: boolean; privacy?: Privacy; publishAt?: string; visualMode?: VisualMode };
}

interface State {
  jobs: JobSummary[] | null;
  loading: boolean;
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

/** 작업 목록 — 실행 중인 작업이 있으면 5초, 아니면 30초 간격으로 갱신 */
export function useYoutubeJobs() {
  const [state, setState] = useState<State>({ jobs: null, loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: s.jobs === null, error: null }));
    try {
      const res = await fetch("/api/youtube/jobs", { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const jobs = (await res.json()) as JobSummary[];
      setState({ jobs, loading: false, error: null });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "작업 목록을 불러오지 못했습니다",
      }));
    }
  }, []);

  /** 작업 생성 — 성공 시 Job 반환 (실패는 throw) */
  const create = useCallback(
    async (input: CreateJobInput): Promise<Job> => {
      const res = await fetch("/api/youtube/jobs", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const job = (await res.json()) as Job;
      void load();
      return job;
    },
    [load],
  );

  // 폴링 간격은 상태에서 파생 (effect 안에서 setState 없음)
  const anyRunning = state.jobs?.some((j) => j.running) ?? false;
  const intervalMs = anyRunning ? 5_000 : 30_000;

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load, intervalMs]);

  return { ...state, reload: load, create };
}
