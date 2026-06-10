"use client";

import type { DaycareFilters } from "@/hooks/useDaycares";
import { TYPE_FILTERS } from "@/lib/types";

interface FilterChipsProps {
  filters: DaycareFilters;
  onChange: (filters: DaycareFilters) => void;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-blue-600 bg-blue-50 text-blue-700"
          : "border-gray-200 bg-white text-gray-600 active:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function FilterChips({ filters, onChange }: FilterChipsProps) {
  const toggleType = (type: string) => {
    const types = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onChange({ ...filters, types });
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <Chip
        active={filters.types.length === 0}
        onClick={() => onChange({ ...filters, types: [] })}
      >
        전체
      </Chip>
      {TYPE_FILTERS.map((t) => (
        <Chip
          key={t}
          active={filters.types.includes(t)}
          onClick={() => toggleType(t)}
        >
          {t}
        </Chip>
      ))}
      <span className="mx-0.5 my-1 w-px shrink-0 bg-gray-200" />
      <Chip
        active={filters.avail}
        onClick={() => onChange({ ...filters, avail: !filters.avail })}
      >
        정원 여유
      </Chip>
      <Chip
        active={filters.bus}
        onClick={() => onChange({ ...filters, bus: !filters.bus })}
      >
        통학차량
      </Chip>
      <Chip
        active={filters.cctv}
        onClick={() => onChange({ ...filters, cctv: !filters.cctv })}
      >
        CCTV
      </Chip>
    </div>
  );
}
