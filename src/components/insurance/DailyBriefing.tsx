"use client";

import type { BriefingEntry } from "@/lib/insurance/daily";
import { CATEGORY_LABELS, type CategoryKey } from "@/lib/insurance/types";

interface Props {
  entries: BriefingEntry[];
  onSelectCategory: (category: CategoryKey) => void;
}

/** 오늘의 브리핑 — 지난 24시간 신규 항목 카테고리별 요약 */
export default function DailyBriefing({ entries, onSelectCategory }: Props) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, e) => sum + e.count, 0);

  return (
    <details open className="group rounded-xl border border-teal-200 bg-teal-50/50">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2.5 text-xs font-semibold text-teal-800">
        <span>
          ☀️ 오늘의 브리핑 — 지난 24시간 신규 {total}건
        </span>
        <span className="ml-auto text-teal-400 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 border-t border-teal-100 px-4 py-3">
        {entries.map((entry) => (
          <div key={entry.category} className="text-xs">
            <button
              onClick={() => onSelectCategory(entry.category)}
              className="font-semibold text-teal-800 hover:underline"
            >
              {CATEGORY_LABELS[entry.category]} {entry.count}건 →
            </button>
            <ul className="mt-0.5 flex flex-col gap-0.5 text-gray-600">
              {entry.top.map((item) => (
                <li key={item.id} className="truncate">
                  ·{" "}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-teal-700 hover:underline"
                  >
                    {item.titleKo ?? item.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
