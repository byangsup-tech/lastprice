import Link from "next/link";
import type { JobSummary } from "@/lib/youtube/types";
import { STAGES } from "@/lib/youtube/types";
import { formatRelativeTime } from "@/lib/insurance/format";
import StageTimeline from "./StageTimeline";

/** 작업 목록 카드 — 제목 · 생성 시각 · 7단계 점 · 산출물 배지 */
export default function JobCard({ job }: { job: JobSummary }) {
  const failed = STAGES.find((s) => job.stages[s] === "failed");
  const doneCount = STAGES.filter((s) => job.stages[s] === "done").length;
  const allDone = STAGES.every((s) => job.stages[s] === "done" || job.stages[s] === "skipped");
  return (
    <div className="relative rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:border-teal-400 hover:bg-teal-50/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{job.id}</code>
        {job.demo && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">데모</span>
        )}
        {job.running && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-700">
            <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            실행 중
          </span>
        )}
        {!job.running && failed && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">실패</span>
        )}
        {!job.running && !failed && allDone && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">완료</span>
        )}
        <span className="ml-auto shrink-0">{formatRelativeTime(job.createdAt)}</span>
      </div>
      <h3 className="mt-1 text-sm font-semibold leading-snug text-gray-900">
        <Link href={`/youtube/jobs/${encodeURIComponent(job.id)}`} className="after:absolute after:inset-0">
          {job.title}
        </Link>
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StageTimeline stages={job.stages} running={job.running} size="sm" />
        <span className="text-[11px] text-gray-400">{doneCount}/{STAGES.length} 단계</span>
        <div className="flex flex-wrap gap-1">
          {job.hasVideo && (
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">🎞 영상</span>
          )}
          {job.hasThumbnail && (
            <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">🖼 썸네일</span>
          )}
          {job.youtubeUrl && (
            <a
              href={job.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
            >
              ▶ YouTube
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
