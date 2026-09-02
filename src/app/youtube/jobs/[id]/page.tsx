"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import ArtifactPanel from "@/components/youtube/ArtifactPanel";
import JobActionBar from "@/components/youtube/JobActionBar";
import LogTail from "@/components/youtube/LogTail";
import MetadataPanel from "@/components/youtube/MetadataPanel";
import ScriptPreview from "@/components/youtube/ScriptPreview";
import StageTimeline, { STAGE_STATUS_LABEL } from "@/components/youtube/StageTimeline";
import YoutubeHeader from "@/components/youtube/YoutubeHeader";
import { useYoutubeJob } from "@/hooks/useYoutubeJob";
import { useYoutubeStatus } from "@/hooks/useYoutubeStatus";
import { STAGES, STAGE_LABELS, type StageKey, type StageStatus } from "@/lib/youtube/types";
import { formatRelativeTime } from "@/lib/insurance/format";

export default function YoutubeJobPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, running, pending, run, saveScript, reload } = useYoutubeJob(id);
  const status = useYoutubeStatus();

  const localRunAllowed = status.data?.localRunAllowed ?? true;
  const job = data?.job;
  const stageStatuses = job
    ? (Object.fromEntries(STAGES.map((s) => [s, job.stages[s]?.status ?? "pending"])) as Record<StageKey, StageStatus>)
    : null;
  const notes = job
    ? Object.fromEntries(
        STAGES.map((s) => [s, job.stages[s]?.error ?? job.stages[s]?.note]).filter(([, v]) => !!v),
      )
    : undefined;
  const failedStages = job ? STAGES.filter((s) => job.stages[s]?.status === "failed") : [];
  const runningStage = job ? STAGES.find((s) => job.stages[s]?.status === "running") : undefined;
  const hasVideo = !!data?.files.some((f) => f.name === "final.mp4");
  const fileUrl = (name: string) => `/api/youtube/jobs/${encodeURIComponent(id)}/file?name=${encodeURIComponent(name)}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6">
      <YoutubeHeader subtitle="작업 상세">
        <Link
          href="/youtube"
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          ← 목록
        </Link>
        <button
          onClick={() => void reload()}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 transition-colors hover:border-teal-500 hover:text-teal-700"
        >
          새로고침
        </button>
      </YoutubeHeader>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          작업을 불러오지 못했습니다: {error}
          <button onClick={() => void reload()} className="ml-2 font-medium underline">
            다시 시도
          </button>
          <p className="mt-1 text-xs text-red-500">
            id: <code>{id}</code> — 삭제됐거나 이 환경에 content/youtube/jobs/{id}/ 가 없을 수 있습니다.
          </p>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col gap-2">
          <div className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-gray-200 bg-white" />
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" />
        </div>
      )}

      {data && job && stageStatuses && (
        <>
          {/* ── 헤더 카드 ─────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{job.id}</code>
              {job.demo && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">데모</span>}
              {running && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 font-medium text-teal-700">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                  실행 중{runningStage && ` · ${STAGE_LABELS[runningStage]}`}
                </span>
              )}
              <span>
                {formatRelativeTime(job.createdAt)} 생성 · {formatRelativeTime(job.updatedAt)} 갱신
              </span>
              <span className="ml-auto">
                {job.options.privacy}
                {job.options.publishAt && ` · 예약 ${new Date(job.options.publishAt).toLocaleString("ko-KR")}`}
                {job.options.visualMode && ` · ${job.options.visualMode}`}
              </span>
            </div>
            <h2 className="mt-1 text-lg font-bold leading-snug text-gray-900">{data.script?.title ?? job.topic.title}</h2>
            {data.script && data.script.title !== job.topic.title && (
              <p className="mt-0.5 text-xs text-gray-500">주제: {job.topic.title}</p>
            )}
            {job.topic.angle && <p className="mt-0.5 text-xs text-gray-500">앵글: {job.topic.angle}</p>}
            {job.topic.keywords.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {job.topic.keywords.map((k) => (
                  <span key={k} className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">
                    #{k}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3">
              <StageTimeline stages={stageStatuses} running={running} size="md" showLabels notes={notes} />
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              {STAGES.map((s) => {
                const st = job.stages[s];
                if (!st || st.status === "pending" || !(st.note || st.error)) return null;
                return (
                  <li key={s} className={st.status === "failed" ? "text-red-600" : undefined}>
                    <span className="font-medium">{STAGE_LABELS[s]}</span> {STAGE_STATUS_LABEL[st.status]}
                    {st.note && ` · ${st.note}`}
                    {st.error && ` · ${st.error}`}
                  </li>
                );
              })}
            </ul>
          </section>

          {failedStages.length > 0 && !running && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700">
              <strong>{failedStages.map((s) => STAGE_LABELS[s]).join(", ")} 단계 실패.</strong> 아래 로그를 확인한 뒤 해당 단계부터
              다시 실행하세요 — 입력이 같으면 앞 단계는 자동으로 건너뜁니다.
              {!localRunAllowed && (
                <>
                  {" "}
                  CLI: <code className="rounded bg-red-100 px-1">npm run yt -- run --job {job.id} --from {failedStages[0]}</code>
                </>
              )}
            </div>
          )}

          <JobActionBar
            job={job}
            running={running}
            pending={pending}
            localRunAllowed={localRunAllowed}
            uploadConfigured={status.data?.keys.youtubeUpload ?? false}
            hasScript={!!data.script}
            hasVideo={hasVideo}
            onRun={run}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="flex flex-col gap-4 lg:col-span-3">
              {data.script ? (
                <ScriptPreview
                  script={data.script}
                  targetMinutes={job.profile.targetMinutes}
                  onSave={async (s) => {
                    const r = await saveScript(s);
                    return r.ok ? { ok: true } : { ok: false, error: r.error, reasons: r.reasons };
                  }}
                  disabled={running || !!pending || !localRunAllowed}
                  disabledReason={
                    running || pending
                      ? "실행 중에는 대본을 편집할 수 없습니다"
                      : !localRunAllowed
                        ? "이 환경에서는 대본을 저장할 수 없습니다 — 로컬에서 script.json을 편집하세요"
                        : undefined
                  }
                />
              ) : (
                <section className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
                  <p>아직 대본이 없습니다.</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {localRunAllowed ? (
                      <>
                        위의 <strong>대본까지 생성</strong>을 누르면 {status.data?.llmProvider === "anthropic" ? "Anthropic LLM" : "템플릿"}으로
                        초안을 만듭니다. 생성 후 여기서 검토·수정하고 저장(승인)한 뒤 음성·영상을 만드세요.
                      </>
                    ) : (
                      <>
                        CLI: <code className="rounded bg-gray-100 px-1">npm run yt -- script --job {job.id}</code>
                      </>
                    )}
                  </p>
                </section>
              )}
              <MetadataPanel metadata={data.metadata} script={data.script} />
            </div>
            <div className="flex flex-col gap-4 lg:col-span-2">
              <ArtifactPanel job={job} files={data.files} />
              {data.timeline && (
                <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-600">
                  <h2 className="text-sm font-semibold text-gray-800">타임라인</h2>
                  <p className="mt-1">
                    장면 {data.timeline.scenes.length}개 · 총 {(data.timeline.totalMs / 1000 / 60).toFixed(1)}분
                    {job.outputs.measuredCharsPerMinute && ` · 실측 ${Math.round(job.outputs.measuredCharsPerMinute)}자/분`}
                  </p>
                </section>
              )}
              <LogTail lines={data.logTail} running={running} href={data.files.some((f) => f.name === "logs/pipeline.log") ? fileUrl("logs/pipeline.log") : undefined} />
            </div>
          </div>
        </>
      )}
    </main>
  );
}
