"use client";

import { useState } from "react";

interface Props {
  onCreate: (topic: { title: string; angle?: string; keywords?: string[] }) => Promise<void>;
  disabled?: boolean;
  busy?: boolean;
}

/** 수동 주제 입력 폼 — 제목·앵글·키워드 → 작업 생성 */
export default function TopicForm({ onCreate, disabled, busy }: Props) {
  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 2 && title.trim().length <= 120;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || disabled || busy) return;
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        angle: angle.trim() || undefined,
        keywords: keywords
          .split(/[,\s]+/)
          .map((k) => k.trim())
          .filter(Boolean)
          .slice(0, 10),
      });
      setTitle("");
      setAngle("");
      setKeywords("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 생성 실패");
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-800">직접 주제 입력</h3>
      <p className="mt-0.5 text-xs text-gray-500">후보에 없는 주제로 작업을 만듭니다 (제목 2~120자)</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="영상 주제 제목 (필수)"
          maxLength={120}
          disabled={disabled}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 disabled:bg-gray-50 sm:col-span-2"
        />
        <input
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          placeholder="앵글 · 관점 (선택) 예: 30대 직장인이 지금 확인할 것"
          maxLength={300}
          disabled={disabled}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 disabled:bg-gray-50"
        />
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="키워드 (쉼표 구분, 선택)"
          disabled={disabled}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-teal-500 disabled:bg-gray-50"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={!valid || disabled || busy}
          title={disabled ? "서버리스 환경에서는 작업을 만들 수 없습니다 — CLI: npm run yt -- new --topic \"제목\"" : undefined}
          className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "생성 중…" : "작업 생성"}
        </button>
        {disabled && (
          <span className="text-xs text-gray-400">
            CLI: <code className="rounded bg-gray-100 px-1">npm run yt -- new --topic &quot;제목&quot;</code>
          </span>
        )}
      </div>
    </form>
  );
}
