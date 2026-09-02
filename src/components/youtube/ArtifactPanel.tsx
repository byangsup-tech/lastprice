import type { Job, JobDetailResponse } from "@/lib/youtube/types";
import { formatDuration } from "@/lib/youtube/util";

interface Props {
  job: Job;
  files: JobDetailResponse["files"];
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** 산출물 미리보기 — 썸네일 · 영상 · 프레임 스트립 · 다운로드 링크 · 업로드 결과 */
export default function ArtifactPanel({ job, files }: Props) {
  const fileUrl = (name: string, size?: number) =>
    `/api/youtube/jobs/${encodeURIComponent(job.id)}/file?name=${encodeURIComponent(name)}${size ? `&v=${size}` : ""}`;
  const byName = new Map(files.map((f) => [f.name, f.size]));
  const video = byName.get("final.mp4");
  const thumb = byName.has("thumbnail.png") ? "thumbnail.png" : byName.has("thumbnail.jpg") ? "thumbnail.jpg" : null;
  const frames = files.filter((f) => f.name.startsWith("frames/")).slice(0, 8);
  const downloads = ["subtitles.srt", "script.json", "metadata.json"].filter((n) => byName.has(n));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800">미리보기</h2>
        {job.outputs.durationMs && (
          <span className="text-xs text-gray-400">영상 {formatDuration(job.outputs.durationMs)}</span>
        )}
      </div>

      {job.outputs.youtubeUrl && (
        <a
          href={job.outputs.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          ▶ YouTube에 업로드됨 — {job.outputs.youtubeUrl}
          <span className="ml-auto text-xs font-normal text-red-500">
            {job.options.privacy}
            {job.options.publishAt && ` · 예약 ${new Date(job.options.publishAt).toLocaleString("ko-KR")}`}
          </span>
        </a>
      )}

      {video ? (
        <video
          controls
          preload="metadata"
          src={fileUrl("final.mp4", video)}
          poster={thumb ? fileUrl(thumb, byName.get(thumb)) : undefined}
          className="aspect-video w-full rounded-lg bg-black"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
          final.mp4 없음 — 영상 합성 단계를 실행하세요
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium text-gray-500">썸네일 (1280×720)</h3>
          {thumb ? (
            <a href={fileUrl(thumb)} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl(thumb, byName.get(thumb))}
                alt="썸네일 미리보기"
                className="mt-1 aspect-video w-full rounded-lg border border-gray-200 object-cover"
              />
            </a>
          ) : (
            <div className="mt-1 flex aspect-video items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
              아직 없음
            </div>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-500">
            프레임 {frames.length > 0 && <span className="text-gray-400">(처음 {frames.length}장)</span>}
          </h3>
          {frames.length > 0 ? (
            <div className="mt-1 grid grid-cols-4 gap-1">
              {frames.map((f) => (
                <a key={f.name} href={fileUrl(f.name)} target="_blank" rel="noopener noreferrer" title={f.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl(f.name, f.size)}
                    alt={f.name}
                    loading="lazy"
                    className="aspect-video w-full rounded border border-gray-200 object-cover"
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="mt-1 flex aspect-video items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
              시각자료 단계 후 표시
            </div>
          )}
        </div>
      </div>

      {downloads.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {downloads.map((n) => (
            <a
              key={n}
              href={fileUrl(n)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:border-teal-500 hover:text-teal-700"
            >
              {n} <span className="text-gray-400">{fmtBytes(byName.get(n) ?? 0)}</span>
            </a>
          ))}
          {video && (
            <a
              href={fileUrl("final.mp4")}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-medium text-gray-700 hover:border-teal-500 hover:text-teal-700"
            >
              final.mp4 <span className="text-gray-400">{fmtBytes(video)}</span>
            </a>
          )}
        </div>
      )}
    </section>
  );
}
