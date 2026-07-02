"use client";

import { formatDistance, haversineMeters } from "@/lib/geo";
import {
  availability,
  childPerTeacher,
  type Daycare,
  type TrendMetrics,
} from "@/lib/types";
import { typeBadgeClass } from "@/lib/ui";

interface CompareTableProps {
  items: Daycare[];
  /** 기준 위치 (있으면 거리 행 표시) */
  center: { lat: number; lng: number } | null;
  /** id별 추이 지표 (없으면 해당 행 "-" 표시) */
  trends?: Record<string, TrendMetrics | null>;
  onRemove: (id: string) => void;
}

interface RowDef {
  label: string;
  value: (d: Daycare) => React.ReactNode;
  /** 수치 비교용. best와 함께 쓰임 */
  num?: (d: Daycare) => number | null;
  best?: "max" | "min";
}

export default function CompareTable({
  items,
  center,
  trends,
  onRemove,
}: CompareTableProps) {
  const distanceOf = (d: Daycare) =>
    center ? haversineMeters(center.lat, center.lng, d.lat, d.lng) : null;

  const rows: RowDef[] = [
    {
      label: "유형",
      value: (d) => (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${typeBadgeClass(d.type)}`}
        >
          {d.type}
        </span>
      ),
    },
    ...(center
      ? [
          {
            label: "거리",
            value: (d: Daycare) => formatDistance(distanceOf(d)!),
            num: distanceOf,
            best: "min",
          } satisfies RowDef,
        ]
      : []),
    { label: "정원", value: (d) => `${d.capacity}명` },
    { label: "현원", value: (d) => `${d.current}명` },
    {
      label: "정원 여유",
      value: (d) =>
        availability(d) > 0 ? `${availability(d)}명` : "마감",
      num: (d) => availability(d),
      best: "max",
    },
    {
      label: "월평균 자리 발생",
      value: (d) => {
        const t = trends?.[d.id];
        return t ? `${t.monthlySlotOpenings}자리` : "-";
      },
      num: (d) => trends?.[d.id]?.monthlySlotOpenings ?? null,
      best: "max",
    },
    {
      label: "3개월 여유 변화",
      value: (d) => {
        const delta = trends?.[d.id]?.availDelta90d;
        if (delta === null || delta === undefined) return "-";
        return `${delta >= 0 ? "+" : ""}${delta}명`;
      },
      num: (d) => trends?.[d.id]?.availDelta90d ?? null,
      best: "max",
    },
    { label: "보육교직원", value: (d) => `${d.staffCount}명` },
    {
      label: "교사당 아동",
      value: (d) => {
        const r = childPerTeacher(d);
        return r === null ? "-" : `1:${r}`;
      },
      num: (d) => childPerTeacher(d),
      best: "min",
    },
    {
      label: "보육실",
      value: (d) => `${d.roomCount}실${d.roomArea ? ` · ${d.roomArea}㎡` : ""}`,
    },
    {
      label: "놀이터",
      value: (d) => `${d.playgroundCount}개`,
      num: (d) => d.playgroundCount,
      best: "max",
    },
    {
      label: "CCTV",
      value: (d) => `${d.cctvCount}대`,
      num: (d) => d.cctvCount,
      best: "max",
    },
    { label: "통학차량", value: (d) => (d.hasBus ? "운영 🚌" : "미운영") },
    { label: "운영현황", value: (d) => d.status },
    { label: "인가일자", value: (d) => d.approvedAt ?? "-" },
    { label: "주소", value: (d) => <span className="text-xs">{d.address}</span> },
    {
      label: "전화",
      value: (d) =>
        d.tel ? (
          <a href={`tel:${d.tel}`} className="text-xs text-blue-600">
            {d.tel}
          </a>
        ) : (
          "-"
        ),
    },
  ];

  /** 행별 최적값 인덱스 집합 (동점 모두 하이라이트) */
  const bestIndexes = (row: RowDef): Set<number> => {
    if (!row.num || !row.best) return new Set();
    const values = items.map((d) => row.num!(d));
    const valid = values.filter((v): v is number => v !== null);
    if (valid.length < 2) return new Set();
    const target = row.best === "max" ? Math.max(...valid) : Math.min(...valid);
    const set = new Set<number>();
    values.forEach((v, i) => {
      if (v === target) set.add(i);
    });
    return set;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-24 bg-white p-2" />
            {items.map((d) => (
              <th
                key={d.id}
                className="min-w-32 border-b border-gray-200 p-2 align-top"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-left text-xs leading-tight font-bold">
                    {d.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`${d.name} 비교에서 제거`}
                    onClick={() => onRemove(d.id)}
                    className="shrink-0 text-xs text-gray-400"
                  >
                    ✕
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const best = bestIndexes(row);
            return (
              <tr key={row.label}>
                <td className="sticky left-0 z-10 border-b border-gray-100 bg-white p-2 text-xs font-semibold text-gray-400">
                  {row.label}
                </td>
                {items.map((d, i) => (
                  <td
                    key={d.id}
                    className={`border-b border-gray-100 p-2 text-center ${
                      best.has(i) ? "bg-green-50 font-bold text-green-700" : ""
                    }`}
                  >
                    {row.value(d)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
