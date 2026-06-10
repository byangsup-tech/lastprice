"use client";

import Link from "next/link";
import { COMPARE_MAX } from "@/hooks/useCompareSelection";

interface CompareBarProps {
  ids: string[];
  center: { lat: number; lng: number };
  onClear: () => void;
}

export default function CompareBar({ ids, center, onClear }: CompareBarProps) {
  if (ids.length === 0) return null;
  const href = `/compare?ids=${ids.map(encodeURIComponent).join(",")}&lat=${center.lat.toFixed(6)}&lng=${center.lng.toFixed(6)}`;

  return (
    <div className="fixed inset-x-0 bottom-3 z-[1150] flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full bg-gray-900/95 py-2 pr-2 pl-4 text-white shadow-xl">
        <Link href={href} className="text-sm font-bold">
          비교하기 ({ids.length}/{COMPARE_MAX})
        </Link>
        <button
          type="button"
          aria-label="비교 선택 비우기"
          onClick={onClear}
          className="rounded-full bg-white/15 px-2 py-0.5 text-xs"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
