"use client";

/** 토스식 기간 선택 세그먼트 — 차트 섹션 헤더 우측에 배치 */

export interface RangeOption {
  label: string;
  /** 최근 n개 데이터 포인트. null = 전체 */
  count: number | null;
}

interface Props {
  options: RangeOption[];
  value: number | null;
  onChange: (count: number | null) => void;
}

export default function RangeSegment({ options, value, onChange }: Props) {
  return (
    <div
      className="ml-auto flex shrink-0 rounded-lg bg-gray-100 p-0.5"
      role="group"
      aria-label="기간 선택"
    >
      {options.map((opt) => {
        const active = opt.count === value;
        return (
          <button
            key={opt.label}
            onClick={() => onChange(opt.count)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
