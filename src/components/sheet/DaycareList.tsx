"use client";

import type { DaycareWithDistance } from "@/lib/types";
import DaycareCard from "./DaycareCard";

interface DaycareListProps {
  items: DaycareWithDistance[];
  loading: boolean;
  error: string | null;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onSelect: (id: string) => void;
}

export default function DaycareList({
  items,
  loading,
  error,
  compareIds,
  onToggleCompare,
  onSelect,
}: DaycareListProps) {
  if (error) {
    return (
      <p className="px-4 py-10 text-center text-sm text-red-500">{error}</p>
    );
  }
  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-gray-400">
        반경 내 어린이집이 없습니다.
        <br />
        반경을 넓히거나 필터를 조정해보세요.
      </p>
    );
  }
  return (
    <div className={loading ? "opacity-60" : ""}>
      {items.map((d) => (
        <DaycareCard
          key={d.id}
          daycare={d}
          compared={compareIds.includes(d.id)}
          onToggleCompare={onToggleCompare}
          onClick={onSelect}
        />
      ))}
    </div>
  );
}
