"use client";

import { useState } from "react";
import type { Script, VideoMetadata } from "@/lib/youtube/types";
import { formatChapterTime } from "@/lib/youtube/util";

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // 클립보드 권한 없음 — 무시
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 transition-colors hover:border-teal-500 hover:text-teal-700"
    >
      {done ? "복사됨 ✓" : label}
    </button>
  );
}

interface Props {
  metadata: VideoMetadata | null;
  script: Script | null;
}

/** 유튜브 메타데이터 — 제목/대안 제목/설명/태그/챕터 + 복사 버튼 */
export default function MetadataPanel({ metadata, script }: Props) {
  if (!metadata && !script) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-800">메타데이터</h2>
        <p className="mt-2 text-xs text-gray-400">대본 생성 후 제목·설명·태그가 여기에 표시됩니다</p>
      </section>
    );
  }
  const title = metadata?.title ?? script?.title ?? "";
  const description = metadata?.description ?? script?.description ?? "";
  const tags = metadata?.tags ?? script?.tags ?? [];
  const altTitles = script?.altTitles ?? [];
  const chapters = metadata?.chapters ?? [];
  const credits = metadata?.credits ?? [];

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-800">메타데이터</h2>
        {metadata && (
          <span className="text-[11px] text-gray-400">
            카테고리 {metadata.categoryId} · {metadata.language}
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500">제목 · {title.length}자</span>
          <CopyButton text={title} />
        </div>
        <p className="mt-0.5 text-sm font-semibold text-gray-900">{title}</p>
        {altTitles.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5">
            {altTitles.map((t) => (
              <li key={t} className="flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>· {t}</span>
                <CopyButton text={t} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500">설명 · {description.length}자</span>
          <CopyButton text={description} />
        </div>
        <textarea
          readOnly
          value={description}
          rows={8}
          className="mt-0.5 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed text-gray-700 outline-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500">태그 · {tags.length}개</span>
          <CopyButton text={tags.join(", ")} />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {tags.map((t) => (
            <span key={t} className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-medium text-teal-700">
              #{t}
            </span>
          ))}
          {tags.length === 0 && <span className="text-xs text-gray-400">없음</span>}
        </div>
      </div>

      {chapters.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-500">챕터 · {chapters.length}개</span>
            <CopyButton text={chapters.map((c) => `${formatChapterTime(c.startMs)} ${c.title}`).join("\n")} />
          </div>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-700">
            {chapters.map((c) => (
              <li key={`${c.startMs}-${c.title}`}>
                <span className="mr-2 font-mono tabular-nums text-gray-400">{formatChapterTime(c.startMs)}</span>
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {credits.length > 0 && (
        <div>
          <span className="text-xs font-medium text-gray-500">크레딧</span>
          <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-gray-500">
            {credits.map((c) => (
              <li key={c} className="truncate">{c}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
