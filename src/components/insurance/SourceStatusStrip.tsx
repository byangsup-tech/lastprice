import type { SourceState, SourceStatus } from "@/lib/insurance/types";
import { CATEGORY_LABELS } from "@/lib/insurance/types";

const STATUS_META: Record<SourceStatus, { label: string; dot: string }> = {
  live: { label: "정상", dot: "bg-emerald-500" },
  stale: { label: "지연(캐시)", dot: "bg-amber-500" },
  error: { label: "수집 실패", dot: "bg-red-500" },
  "no-key": { label: "키 미설정", dot: "bg-gray-400" },
  demo: { label: "예시", dot: "bg-sky-500" },
};

export default function SourceStatusStrip({
  sources,
}: {
  sources: SourceState[];
}) {
  const liveCount = sources.filter((s) => s.status === "live").length;
  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600">
        <span>
          소스 상태 — 정상 {liveCount} / 전체 {sources.length}
        </span>
        <span className="ml-auto text-gray-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ul className="grid grid-cols-1 gap-1 border-t border-gray-100 px-4 py-3 sm:grid-cols-2">
        {sources.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <li
              key={s.id}
              className="flex items-center gap-2 text-xs text-gray-600"
              title={s.error}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 text-gray-400">
                {CATEGORY_LABELS[s.category]} · {meta.label}
                {s.count > 0 && ` · ${s.count}건`}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
