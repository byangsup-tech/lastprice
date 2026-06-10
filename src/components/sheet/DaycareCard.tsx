"use client";

import { formatDistance } from "@/lib/geo";
import {
  availability,
  childPerTeacher,
  type DaycareWithDistance,
} from "@/lib/types";
import { typeBadgeClass } from "@/lib/ui";

interface DaycareCardProps {
  daycare: DaycareWithDistance;
  compared: boolean;
  onToggleCompare: (id: string) => void;
  onClick: (id: string) => void;
}

export default function DaycareCard({
  daycare: d,
  compared,
  onToggleCompare,
  onClick,
}: DaycareCardProps) {
  const avail = availability(d);
  const ratio = childPerTeacher(d);
  const isActive = d.status === "정상";

  return (
    <div
      className={`flex items-stretch gap-2 border-b border-gray-100 px-4 py-3 ${isActive ? "" : "opacity-55"}`}
    >
      <button
        type="button"
        onClick={() => onClick(d.id)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${typeBadgeClass(d.type)}`}
          >
            {d.type}
          </span>
          {d.status !== "정상" && (
            <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-500">
              {d.status}
            </span>
          )}
          <span className="truncate text-sm font-semibold">{d.name}</span>
          <span className="ml-auto shrink-0 text-xs font-medium text-gray-400">
            {formatDistance(d.distance)}
          </span>
        </div>

        <p className="mt-1 text-xs text-gray-600">
          정원 {d.capacity} · 현원 {d.current} ·{" "}
          {!isActive ? (
            <span className="font-bold text-gray-400">운영 휴지 중</span>
          ) : avail > 0 ? (
            <span className="font-bold text-green-600">여유 {avail}명</span>
          ) : (
            <span className="font-bold text-red-500">정원 마감</span>
          )}
        </p>

        <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
          <span>
            👩‍🏫 교사 {d.staffCount}
            {ratio !== null && ` (1:${ratio})`}
          </span>
          <span>📹 CCTV {d.cctvCount}대</span>
          {d.hasBus && <span>🚌 통학차량</span>}
        </p>
      </button>

      <div className="flex shrink-0 flex-col items-center justify-center gap-2">
        <label className="flex flex-col items-center text-[10px] text-gray-400">
          <input
            type="checkbox"
            checked={compared}
            onChange={() => onToggleCompare(d.id)}
            className="h-4 w-4 accent-blue-600"
          />
          비교
        </label>
        {d.tel && (
          <a
            href={`tel:${d.tel}`}
            aria-label={`${d.name} 전화하기`}
            className="rounded-full bg-gray-100 p-1.5 text-sm"
          >
            📞
          </a>
        )}
      </div>
    </div>
  );
}
