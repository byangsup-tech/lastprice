"use client";

import type { BriefingEntry } from "@/lib/insurance/daily";
import {
  CATEGORY_LABELS,
  type CategoryKey,
  type FeedItem,
} from "@/lib/insurance/types";

interface Props {
  /** 완독형 "꼭 볼 N건" — 중요도순 */
  picks: FeedItem[];
  /** 카테고리별 신규 건수 (하단 칩) */
  entries: BriefingEntry[];
  onSelectCategory: (category: CategoryKey) => void;
}

/** 뉴닉식 완독형 브리핑 — 무한 피드가 아니라 끝이 있는 데일리 편성 */
export default function DailyBriefing({
  picks,
  entries,
  onSelectCategory,
}: Props) {
  if (!picks.length) return null;
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <details open className="group rounded-xl border border-teal-200 bg-teal-50/50">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-teal-800">
        <span>
          ☀️ 오늘의 브리핑 — 꼭 볼 {picks.length}건 · 신규 {total}건
        </span>
        <span className="ml-auto text-teal-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-teal-100 px-4 py-3">
        <ol className="flex flex-col gap-1.5">
          {picks.map((item, i) => (
            <li key={item.id} className="flex items-baseline gap-2 text-xs">
              <span className="w-4 shrink-0 text-right font-bold text-teal-600">
                {i + 1}
              </span>
              <span className="min-w-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-gray-800 hover:text-teal-700 hover:underline"
                >
                  {item.titleKo ?? item.title}
                </a>
                <span className="ml-1.5 whitespace-nowrap text-gray-400">
                  {CATEGORY_LABELS[item.category]} · {item.sourceName}
                </span>
              </span>
            </li>
          ))}
        </ol>
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-teal-100 pt-2">
            {entries.map((entry) => (
              <button
                key={entry.category}
                onClick={() => onSelectCategory(entry.category)}
                className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-teal-700 transition-colors hover:bg-teal-100"
              >
                {CATEGORY_LABELS[entry.category]} {entry.count} →
              </button>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
