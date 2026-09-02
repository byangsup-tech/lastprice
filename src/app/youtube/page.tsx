"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CandidateTable from "@/components/youtube/CandidateTable";
import EnvStatusStrip from "@/components/youtube/EnvStatusStrip";
import JobCard from "@/components/youtube/JobCard";
import ResearchSourceStrip from "@/components/youtube/ResearchSourceStrip";
import TopicForm from "@/components/youtube/TopicForm";
import YoutubeHeader from "@/components/youtube/YoutubeHeader";
import { useYoutubeJobs, type CreateJobInput } from "@/hooks/useYoutubeJobs";
import { useYoutubeResearch } from "@/hooks/useYoutubeResearch";
import { useYoutubeStatus } from "@/hooks/useYoutubeStatus";
import type { TopicCandidate } from "@/lib/youtube/types";

export default function YoutubeDashboardPage() {
  const router = useRouter();
  const status = useYoutubeStatus();
  const research = useYoutubeResearch();
  const jobs = useYoutubeJobs();
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // 쓰기 라우트(작업 생성·리서치 새로고침)는 서버리스에서 403 — 응답 메시지를 그대로 보여준다
  const localRun = status.data?.localRunAllowed ?? true;

  const createAndOpen = async (input: CreateJobInput) => {
    setCreateError(null);
    const job = await jobs.create(input);
    router.push(`/youtube/jobs/${encodeURIComponent(job.id)}`);
  };

  const createFromCandidate = async (c: TopicCandidate) => {
    setCreatingId(c.id);
    try {
      await createAndOpen({ candidateId: c.id });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "작업 생성 실패");
      setCreatingId(null);
    }
  };

  const candidates = research.data?.candidates ?? [];
  const visible = showAll ? candidates : candidates.slice(0, 10);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-4 px-4 py-6">
      <YoutubeHeader>
        {research.data && (
          <button
            onClick={() => void research.refresh()}
            disabled={research.refreshing}
            title="캐시를 무시하고 다시 수집 (서버리스에서는 불가 — CLI: npm run yt -- research --refresh)"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700 disabled:opacity-50"
          >
            {research.refreshing ? "수집 중…" : "새로고침"}
          </button>
        )}
      </YoutubeHeader>

      <EnvStatusStrip status={status.data} loading={status.loading} error={status.error} />

      {status.data && !status.data.localRunAllowed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <strong>대시보드 실행 불가:</strong> 이 환경(서버리스 또는{" "}
          <code className="rounded bg-amber-100 px-1">YT_ALLOW_LOCAL_RUN=0</code>)에서는 파이프라인을 실행할 수 없습니다. 로컬
          터미널에서 <code className="rounded bg-amber-100 px-1">npm run yt -- doctor</code> →{" "}
          <code className="rounded bg-amber-100 px-1">npm run yt -- run --auto</code> 또는 GitHub Actions 워크플로를 사용하세요.
          여기서는 작업 상태·산출물 확인만 가능합니다.
        </div>
      )}

      {/* ── 주제 리서치 ─────────────────────────────── */}
      <section className="flex flex-col gap-2" aria-label="주제 리서치">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-base font-bold text-gray-900">🔎 주제 리서치</h2>
          <span className="text-xs text-gray-500">
            {research.data
              ? `후보 ${candidates.length}개 · 프로필 "${research.data.profileName}" · 점수 = 수요 40% + 경쟁 25% + 적합 25% + 신선 10%`
              : research.loading
                ? "키 없는 소스(트렌드·뉴스·추천어·위키)를 수집 중… 최대 30초"
                : ""}
          </span>
        </div>

        {research.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            리서치를 불러오지 못했습니다: {research.error}
            <button onClick={() => void research.reload()} className="ml-2 font-medium underline">
              다시 시도
            </button>
          </div>
        )}
        {createError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{createError}</div>
        )}

        {research.data && <ResearchSourceStrip report={research.data} />}

        {research.loading && !research.data && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}

        {research.data && (
          <>
            <CandidateTable
              candidates={visible}
              onCreate={(c) => void createFromCandidate(c)}
              creatingId={creatingId}
            />
            {candidates.length > 10 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="self-center rounded-full border border-gray-300 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-teal-500"
              >
                {showAll ? "상위 10개만 보기" : `후보 ${candidates.length}개 모두 보기`}
              </button>
            )}
          </>
        )}

        <TopicForm onCreate={(t) => createAndOpen({ topic: t })} busy={!!creatingId} />
      </section>

      {/* ── 작업 목록 ─────────────────────────────── */}
      <section className="flex flex-col gap-2" aria-label="작업 목록">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-base font-bold text-gray-900">🎞 작업</h2>
          <span className="text-xs text-gray-500">
            {jobs.jobs ? `${jobs.jobs.length}개` : ""}
            {jobs.jobs?.some((j) => j.running) && <span className="ml-1 text-teal-700">· 실행 중</span>}
          </span>
          <button
            onClick={() => void jobs.reload()}
            className="ml-auto text-xs font-medium text-gray-500 hover:text-teal-700"
          >
            목록 갱신
          </button>
        </div>
        {jobs.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            작업 목록을 불러오지 못했습니다: {jobs.error}
          </div>
        )}
        {jobs.loading && !jobs.jobs && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white" />
            ))}
          </div>
        )}
        {jobs.jobs && jobs.jobs.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            <p>아직 작업이 없습니다.</p>
            <p className="mt-1 text-xs text-gray-400">
              위 후보의 <strong>작업 생성</strong>을 누르거나, 터미널에서{" "}
              <code className="rounded bg-gray-100 px-1">npm run yt -- demo</code> (오프라인 데모) ·{" "}
              <code className="rounded bg-gray-100 px-1">npm run yt -- run --auto</code> (자동 선정 후 전체 실행)을 실행하세요.
            </p>
            {!localRun && (
              <p className="mt-1 text-xs text-gray-400">
                이 환경에서는 CLI로 만든 작업만 표시됩니다 (content/youtube/jobs/).
              </p>
            )}
          </div>
        )}
        {jobs.jobs && jobs.jobs.length > 0 && (
          <div className="flex flex-col gap-2">
            {jobs.jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </section>

      <footer className="mt-4 border-t border-gray-200 pt-4 text-center text-xs leading-relaxed text-gray-400">
        키 없이도 템플릿 대본 · Edge TTS · HTML 카드 · ffmpeg로 끝까지 동작 — ANTHROPIC / PEXELS / YOUTUBE 키를 더하면 품질이 올라갑니다
        <br />
        산출물: content/youtube/jobs/&lt;id&gt;/ (final.mp4 · thumbnail.png · subtitles.srt · script.json · metadata.json)
      </footer>
    </main>
  );
}
