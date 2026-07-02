import { NextRequest, NextResponse } from "next/server";
import { candidateRegions } from "@/lib/cache";
import { buildDemoHistory } from "@/lib/demo-data";
import {
  getSnapshotMeta,
  isSnapshotFresh,
  loadRegionHistory,
} from "@/lib/snapshot";
import { computeTrend } from "@/lib/trend";
import type { HistoryEntry } from "@/lib/types";

export const runtime = "nodejs";

function respond(history: HistoryEntry[], crawledAt: string | null) {
  const last = history[history.length - 1];
  const currentAvail = last ? Math.max(0, last.c - last.n) : 0;
  const metrics = history.length > 0 ? computeTrend(history, currentAvail) : null;
  return NextResponse.json({ history, metrics, crawledAt });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));

  const snapshotOk = await isSnapshotFresh();
  if (!snapshotOk && !process.env.CHILDCARE_API_KEY) {
    // 데모 모드: 시연용 가짜 이력
    return respond(buildDemoHistory(decodedId), null);
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) {
    // 좌표 없이는 이력 파일을 특정할 수 없음 — 수집 전 상태와 동일하게 응답
    return respond([], null);
  }

  const meta = await getSnapshotMeta();
  for (const r of candidateRegions(lat, lng, 1000)) {
    const regionHistory = await loadRegionHistory(r.code);
    const entries = regionHistory?.[decodedId];
    if (entries && entries.length > 0) {
      return respond(entries, meta?.crawledAt ?? null);
    }
  }
  // 아직 수집 전이거나 해당 시설 이력 없음
  return respond([], meta?.crawledAt ?? null);
}
