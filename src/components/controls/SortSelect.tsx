"use client";

import type { SortKey } from "@/lib/types";

const OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "distance", label: "거리순" },
  { value: "avail", label: "정원 여유순" },
  { value: "ratio", label: "교사당 아동수 적은순" },
];

interface SortSelectProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
}

export default function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortKey)}
      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
