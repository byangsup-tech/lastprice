"use client";

import { useState } from "react";

interface Props {
  keywords: string[];
  onAdd: (kw: string) => void;
  onRemove: (kw: string) => void;
}

/** 관심 키워드 등록/삭제 — 접이식 (SourceStatusStrip과 같은 details 패턴) */
export default function KeywordManager({ keywords, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");

  const submit = () => {
    onAdd(input);
    setInput("");
  };

  return (
    <details className="group rounded-xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-medium text-gray-600">
        <span>
          🔔 관심 키워드 {keywords.length > 0 && `(${keywords.length})`} — 매칭
          기사 하이라이트
        </span>
        <span className="ml-auto text-gray-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="예: 치매, 유병자, 배타적사용권"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs outline-none transition-colors focus:border-teal-500"
          />
          <button
            onClick={submit}
            className="shrink-0 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800"
          >
            추가
          </button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700"
              >
                {kw}
                <button
                  onClick={() => onRemove(kw)}
                  aria-label={`${kw} 삭제`}
                  className="text-teal-400 hover:text-teal-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
