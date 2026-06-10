import { NextRequest, NextResponse } from "next/server";
import { getDaycares } from "@/lib/cache";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, source } = await getDaycares();
  const daycare = data.find((d) => d.id === decodeURIComponent(id));
  if (!daycare) {
    return NextResponse.json(
      { error: "어린이집을 찾을 수 없습니다" },
      { status: 404 },
    );
  }
  return NextResponse.json({ source, item: daycare });
}
