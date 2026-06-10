"use client";

import { RADIUS_OPTIONS } from "@/lib/types";

interface RadiusChipsProps {
  value: number;
  onChange: (radius: number) => void;
}

function label(r: number) {
  return r < 1000 ? `${r}m` : `${r / 1000}km`;
}

export default function RadiusChips({ value, onChange }: RadiusChipsProps) {
  return (
    <div className="flex gap-1.5">
      {RADIUS_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            value === r
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 active:bg-gray-200"
          }`}
        >
          {label(r)}
        </button>
      ))}
    </div>
  );
}
