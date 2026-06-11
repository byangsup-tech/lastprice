import { NextRequest, NextResponse } from "next/server";
import { getDaycaresForArea } from "@/lib/cache";
import { queryDaycares } from "@/lib/filter";
import { RADIUS_OPTIONS, type SortKey } from "@/lib/types";

export const runtime = "nodejs";
// 콜드 스타트 시 여러 시군구를 처음 수집할 수 있어 기본 10초보다 여유를 둠
export const maxDuration = 60;

const SORT_KEYS: SortKey[] = ["distance", "avail", "ratio"];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radius = Number(sp.get("radius") ?? 1000);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 33 ||
    lat > 39 ||
    lng < 124 ||
    lng > 132
  ) {
    return NextResponse.json(
      { error: "유효한 lat/lng(대한민국 범위)가 필요합니다" },
      { status: 400 },
    );
  }
  if (!RADIUS_OPTIONS.includes(radius as (typeof RADIUS_OPTIONS)[number])) {
    return NextResponse.json(
      { error: `radius는 ${RADIUS_OPTIONS.join(", ")} 중 하나여야 합니다` },
      { status: 400 },
    );
  }

  const sortParam = sp.get("sort") as SortKey | null;
  const sort: SortKey =
    sortParam && SORT_KEYS.includes(sortParam) ? sortParam : "distance";
  const types = (sp.get("type") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { data, source, meta } = await getDaycaresForArea(lat, lng, radius);
  const items = queryDaycares(data, {
    lat,
    lng,
    radius,
    types,
    bus: sp.get("bus") === "1",
    cctv: sp.get("cctv") === "1",
    avail: sp.get("avail") === "1",
    sort,
  });

  const body: Record<string, unknown> = { source, count: items.length, items };
  if (sp.get("debug") === "1") body.meta = meta;
  return NextResponse.json(body);
}
