import { STAGES, STAGE_LABELS, type StageKey, type StageStatus } from "@/lib/youtube/types";

const DOT: Record<StageStatus, string> = {
  pending: "bg-gray-300",
  running: "bg-teal-500",
  done: "bg-emerald-500",
  failed: "bg-red-500",
  skipped: "bg-gray-400",
};

const STATUS_LABEL: Record<StageStatus, string> = {
  pending: "대기",
  running: "실행 중",
  done: "완료",
  failed: "실패",
  skipped: "건너뜀",
};

interface Props {
  stages: Record<StageKey, StageStatus>;
  /** 잠금 기준 실행 중 — running 점에 스피너 링 */
  running?: boolean;
  size?: "sm" | "md";
  /** 단계 이름 표시 (md에서만) */
  showLabels?: boolean;
  /** 단계별 메모/오류 (툴팁) */
  notes?: Partial<Record<StageKey, string>>;
}

/** 7단계 진행 점 — 상태별 색, 실행 중이면 스피너 */
export default function StageTimeline({ stages, running, size = "sm", showLabels, notes }: Props) {
  const dot = size === "sm" ? "h-2.5 w-2.5" : "h-4 w-4";
  const ring = size === "sm" ? "-inset-1 border-2" : "-inset-1.5 border-[3px]";
  return (
    <ol className={`flex items-start ${size === "sm" ? "gap-1" : "gap-0"}`} aria-label="단계 진행">
      {STAGES.map((key, i) => {
        const status = stages[key] ?? "pending";
        const spinning = status === "running" && running;
        return (
          <li
            key={key}
            className={`flex items-center ${size === "md" ? "flex-1" : ""}`}
            title={`${STAGE_LABELS[key]} · ${STATUS_LABEL[status]}${notes?.[key] ? ` — ${notes[key]}` : ""}`}
          >
            <div className={`flex flex-col items-center ${size === "md" ? "min-w-10" : ""}`}>
              <span className="relative flex items-center justify-center">
                <span className={`${dot} rounded-full ${DOT[status]} ${status === "running" && !running ? "animate-pulse" : ""}`} />
                {spinning && (
                  <span
                    className={`absolute ${ring} animate-spin rounded-full border-teal-500 border-t-transparent`}
                    aria-hidden
                  />
                )}
              </span>
              {showLabels && size === "md" && (
                <span
                  className={`mt-1.5 hidden whitespace-nowrap text-[11px] leading-tight sm:block ${
                    status === "failed"
                      ? "font-medium text-red-600"
                      : status === "running"
                        ? "font-medium text-teal-700"
                        : status === "done"
                          ? "text-gray-700"
                          : "text-gray-400"
                  }`}
                >
                  {STAGE_LABELS[key]}
                </span>
              )}
            </div>
            {i < STAGES.length - 1 && (
              <span
                className={`${size === "sm" ? "w-2" : "mb-auto mt-[7px] flex-1"} h-0.5 ${
                  status === "done" || status === "skipped" ? "bg-emerald-300" : "bg-gray-200"
                }`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { STATUS_LABEL as STAGE_STATUS_LABEL };
