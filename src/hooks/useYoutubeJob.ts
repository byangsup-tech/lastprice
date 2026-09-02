"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Job,
  JobDetailResponse,
  Privacy,
  Script,
  StageKey,
} from "@/lib/youtube/types";

export interface RunInput {
  from?: StageKey;
  to?: StageKey;
  force?: boolean;
  upload?: boolean;
  privacy?: Privacy;
  publishAt?: string;
}

export interface RunResult {
  started: boolean;
  pid: number | null;
}

export type SaveScriptResult =
  | { ok: true; script: Script; job: Job }
  | { ok: false; error: string; reasons: string[] };

interface State {
  data: JobDetailResponse | null;
  loading: boolean;
  error: string | null;
  /** 실행 요청 직후 잠금이 잡히기 전까지 잠시 폴링을 유지하기 위한 남은 폴링 횟수 */
  pendingPolls: number;
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

/**
 * 작업 상세 + 실행 중 3초 폴링.
 * 폴링 간격은 상태(running/pendingPolls)에서 파생해 effect deps에 넣는다 — effect 안에서 setState 없음.
 */
export function useYoutubeJob(id: string, opts: { poll?: boolean } = {}) {
  const poll = opts.poll ?? true;
  const [state, setState] = useState<State>({ data: null, loading: true, error: null, pendingPolls: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const base = `/api/youtube/jobs/${encodeURIComponent(id)}`;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: s.data === null, error: null }));
    try {
      const res = await fetch(base, { signal: ctrl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data = (await res.json()) as JobDetailResponse;
      setState((s) => ({
        data,
        loading: false,
        error: null,
        pendingPolls: data.running ? 0 : Math.max(0, s.pendingPolls - 1),
      }));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "작업을 불러오지 못했습니다",
      }));
    }
  }, [base]);

  /** 파이프라인 실행 요청 (실패는 throw — 403/409 메시지 포함) */
  const run = useCallback(
    async (input: RunInput): Promise<RunResult> => {
      const res = await fetch(`${base}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const result = (await res.json()) as RunResult;
      // 자식 프로세스가 잠금을 잡기까지 1~2초 걸리므로 잠시 폴링 유지
      setState((s) => ({ ...s, pendingPolls: 10 }));
      void load();
      return result;
    },
    [base, load],
  );

  /** 대본 저장(승인) — 검증 오류는 throw하지 않고 {ok:false, reasons}로 */
  const saveScript = useCallback(
    async (script: Script): Promise<SaveScriptResult> => {
      const res = await fetch(`${base}/script`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        reasons?: string[];
        script?: Script;
        job?: Job;
      };
      if (!res.ok || !json.script || !json.job) {
        return { ok: false, error: json.error ?? `HTTP ${res.status}`, reasons: json.reasons ?? [] };
      }
      void load();
      return { ok: true, script: json.script, job: json.job };
    },
    [base, load],
  );

  const active = !!state.data?.running || state.pendingPolls > 0;
  const intervalMs = poll && active ? 3_000 : 0;

  useEffect(() => {
    void load();
    if (!intervalMs) return () => abortRef.current?.abort();
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load, intervalMs]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    /** 잠금 기준 실제 실행 여부 (폴링 유지 여부와 별개) */
    running: !!state.data?.running,
    /** 실행 요청 직후 잠금 대기 중 (버튼 비활성화용) */
    pending: state.pendingPolls > 0 && !state.data?.running,
    reload: load,
    run,
    saveScript,
  };
}
