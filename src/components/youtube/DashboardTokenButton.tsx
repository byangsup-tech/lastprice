"use client";

import { useState } from "react";
import { useDashboardToken } from "@/hooks/useYoutubeToken";

interface Props {
  /** 서버에 YT_DASHBOARD_TOKEN이 설정돼 있어 쓰기·실행에 토큰이 필요한지 */
  required: boolean;
}

/** 대시보드 쓰기·실행용 공유 토큰 입력 (localStorage 저장) — 서버가 토큰을 요구할 때만 표시 */
export default function DashboardTokenButton({ required }: Props) {
  const { hasToken, setToken } = useDashboardToken();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!required) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
          hasToken ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
        title="서버의 YT_DASHBOARD_TOKEN과 같은 값을 입력하면 작업 생성·실행·대본 저장이 가능합니다"
      >
        🔑 토큰 {hasToken ? "설정됨" : "필요"}
      </button>
      {open && (
        <form
          className="inline-flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            setToken(draft.trim());
            setDraft("");
            setOpen(false);
          }}
        >
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="YT_DASHBOARD_TOKEN"
            autoComplete="off"
            className="w-44 rounded-md border border-gray-300 px-2 py-1 text-[11px] focus:border-teal-500 focus:outline-none"
          />
          <button type="submit" className="rounded-md bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-700">
            저장
          </button>
          {hasToken && (
            <button
              type="button"
              onClick={() => {
                setToken("");
                setOpen(false);
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            >
              지우기
            </button>
          )}
        </form>
      )}
    </span>
  );
}
