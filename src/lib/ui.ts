/** 유형별 마커 색상 (hex) */
export const TYPE_MARKER_COLORS: Record<string, string> = {
  국공립: "#16a34a",
  민간: "#2563eb",
  가정: "#ea580c",
  직장: "#9333ea",
};

export function markerColor(type: string): string {
  return TYPE_MARKER_COLORS[type] ?? "#6b7280";
}

/** 유형별 배지 Tailwind 클래스 */
const TYPE_BADGE_CLASSES: Record<string, string> = {
  국공립: "bg-green-100 text-green-700",
  민간: "bg-blue-100 text-blue-700",
  가정: "bg-orange-100 text-orange-700",
  직장: "bg-purple-100 text-purple-700",
};

export function typeBadgeClass(type: string): string {
  return TYPE_BADGE_CLASSES[type] ?? "bg-gray-100 text-gray-600";
}
