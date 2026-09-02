import type { ResearchReport, ResearchSourceState } from "@/lib/youtube/types";
import { formatRelativeTime } from "@/lib/insurance/format";

const STATUS_META: Record<ResearchSourceState["status"], { label: string; dot: string }> = {
  live: { label: "정상", dot: "bg-emerald-500" },
  stale: { label: "지연(캐시)", dot: "bg-amber-500" },
  error: { label: "수집 실패", dot: "bg-red-500" },
  "no-key": { label: "키 미설정", dot: "bg-gray-400" },
  skipped: { label: "건너뜀", dot: "bg-gray-300" },
};

const RERANK_LABEL: Record<ResearchReport["llmRerank"], string> = {
  on: "LLM 재정렬 적용",
  "no-key": "LLM 재정렬 없음 (키 미설정)",
  error: "LLM 재정렬 실패",
  off: "LLM 재정렬 꺼짐 (템플릿 모드)",
};

interface Props {
  report: ResearchReport & { cacheStatus?: "live" | "stale" };
}

/** 리서치 소스 상태 — 접이식 목록 */
export default function ResearchSourceStrip({ report }: Props) {
  const liveCount = report.sources.filter((s) => s.status === "live").length;
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer select-none flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-xs font-medium text-gray-600">
        <span>
          소스 상태 — 정상 {liveCount} / 전체 {report.sources.length}
        </span>
        <span className="text-gray-400">· {RERANK_LABEL[report.llmRerank]}</span>
        <span className="text-gray-400">
          · {formatRelativeTime(report.generatedAt)} 수집
          {report.cacheStatus === "stale" && <span className="ml-1 text-amber-600">(캐시)</span>}
        </span>
        <span className="ml-auto text-gray-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="grid grid-cols-1 gap-1 border-t border-gray-100 px-4 py-3 sm:grid-cols-2">
        {report.sources.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <li key={s.id} className="flex items-center gap-2 text-xs text-gray-600" title={s.error}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-gray-400">
                {meta.label}
                {s.count > 0 && ` · ${s.count}건`}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
