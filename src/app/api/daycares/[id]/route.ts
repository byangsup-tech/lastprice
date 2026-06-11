import { NextRequest, NextResponse } from "next/server";
import { findDaycareById } from "@/lib/cache";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const near =
    Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0
      ? { lat, lng }
      : undefined;

  const { daycare, source } = await findDaycareById(
    decodeURIComponent(id),
    near,
  );
  if (!daycare) {
    return NextResponse.json(
      { error: "어린이집을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  return NextResponse.json({ source, item: daycare });
}
