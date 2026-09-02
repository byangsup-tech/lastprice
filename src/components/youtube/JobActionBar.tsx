"use client";

import { useState } from "react";
import type { Job, Privacy } from "@/lib/youtube/types";
import type { RunInput } from "@/hooks/useYoutubeJob";

interface Props {
  job: Job;
  running: boolean;
  /** 실행 요청 후 잠금 대기 중 */
  pending?: boolean;
  localRunAllowed: boolean;
  uploadConfigured: boolean;
  hasScript: boolean;
  hasVideo: boolean;
  onRun: (input: RunInput) => Promise<unknown>;
}

const PRIVACY_LABEL: Record<Privacy, string> = {
  private: "비공개 (private)",
  unlisted: "일부 공개 (unlisted)",
  public: "공개 (public)",
};

/** 실행 액션 바 — 대본까지 / 음성·영상 / 전체(업로드 제외) / 업로드(확인 다이얼로그) */
export default function JobActionBar({
  job,
  running,
  pending,
  localRunAllowed,
  uploadConfigured,
  hasScript,
  hasVideo,
  onRun,
}: Props) {
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>(job.options.privacy ?? "private");
  const [publishAt, setPublishAt] = useState<string>(job.options.publishAt ? toLocalInput(job.options.publishAt) : "");

  const blocked = !localRunAllowed || running || busy || !!pending;
  const cli = `npm run yt -- run --job ${job.id}`;

  const run = async (input: RunInput) => {
    setError(null);
    setBusy(true);
    try {
      await onRun({ ...input, force: force || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "실행 요청 실패");
    } finally {
      setBusy(false);
    }
  };

  const confirmUpload = async () => {
    const iso = publishAt ? new Date(publishAt).toISOString() : undefined;
    setUploadOpen(false);
    await run({
      from: "upload",
      to: "upload",
      upload: true,
      privacy: iso ? "private" : privacy,
      publishAt: iso,
    });
  };

  const btn =
    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const primary = `${btn} bg-teal-700 text-white hover:bg-teal-800`;
  const secondary = `${btn} border border-gray-300 bg-white text-gray-700 hover:border-teal-500 hover:text-teal-700`;
  const title = (extra?: string) =>
    !localRunAllowed
      ? `로컬 환경에서 CLI로 실행하세요: ${cli}`
      : running
        ? "실행 중입니다 — 완료 후 다시 시도하세요"
        : extra;

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={blocked}
          title={title("run --to script")}
          onClick={() => void run({ to: "script" })}
          className={secondary}
        >
          📝 대본까지 생성
        </button>
        <button
          type="button"
          disabled={blocked || !hasScript}
          title={title(hasScript ? "run --from voice --to thumbnail" : "대본이 먼저 필요합니다")}
          onClick={() => void run({ from: "voice", to: "thumbnail" })}
          className={secondary}
        >
          🎙 음성·영상 생성
        </button>
        <button
          type="button"
          disabled={blocked}
          title={title("run --to thumbnail (업로드 제외)")}
          onClick={() => void run({ to: "thumbnail" })}
          className={primary}
        >
          ▶ 전체 실행 <span className="font-normal opacity-80">(업로드 제외)</span>
        </button>
        <button
          type="button"
          disabled={blocked || !hasVideo}
          title={title(
            !hasVideo ? "final.mp4가 먼저 필요합니다" : !uploadConfigured ? "YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN 미설정 — npm run yt -- auth" : "run --from upload --upload",
          )}
          onClick={() => setUploadOpen(true)}
          className={`${btn} bg-red-600 text-white hover:bg-red-700`}
        >
          ⬆ 업로드
        </button>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={!localRunAllowed} />
          강제 재실행 (--force)
        </label>
      </div>

      {(running || pending) && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-teal-700">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
          {running ? "파이프라인 실행 중 — 3초마다 상태를 갱신합니다" : "실행 시작 중…"}
        </p>
      )}
      {!localRunAllowed && (
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          이 환경에서는 대시보드 실행이 꺼져 있습니다 (서버리스 또는 <code className="rounded bg-gray-100 px-1">YT_ALLOW_LOCAL_RUN=0</code>).
          로컬 터미널에서 실행하세요: <code className="rounded bg-gray-100 px-1">{cli}</code>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {uploadOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="YouTube 업로드 확인"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setUploadOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">YouTube에 업로드할까요?</h3>
            <p className="mt-1 text-xs text-gray-500">
              final.mp4 · 썸네일 · 자막(srt)을 채널에 올립니다. 업로드 후에는 YouTube 스튜디오에서만 수정할 수 있습니다.
            </p>
            {!uploadConfigured && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                업로드 키가 설정되지 않아 실패할 수 있습니다 — <code>npm run yt -- auth</code>로 리프레시 토큰을 발급하세요.
              </p>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                공개 범위
                <select
                  value={publishAt ? "private" : privacy}
                  disabled={!!publishAt}
                  onChange={(e) => setPrivacy(e.target.value as Privacy)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500 disabled:bg-gray-50"
                >
                  {(Object.keys(PRIVACY_LABEL) as Privacy[]).map((p) => (
                    <option key={p} value={p}>
                      {PRIVACY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                예약 게시 (선택 — 지정하면 비공개로 올린 뒤 예약 시각에 공개)
                <input
                  type="datetime-local"
                  value={publishAt}
                  onChange={(e) => setPublishAt(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500"
                />
              </label>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <dt className="text-gray-500">공개 범위</dt>
                <dd className="font-medium text-gray-800">{PRIVACY_LABEL[publishAt ? "private" : privacy]}</dd>
                <dt className="text-gray-500">게시 시각</dt>
                <dd className="font-medium text-gray-800">
                  {publishAt ? new Date(publishAt).toLocaleString("ko-KR") : "즉시 (예약 없음)"}
                </dd>
              </dl>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setUploadOpen(false)} className={secondary}>
                취소
              </button>
              <button type="button" onClick={() => void confirmUpload()} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                업로드 시작
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** ISO → datetime-local 입력값 (로컬 시각, 초 제외) */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
