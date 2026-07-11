import { NextResponse } from "next/server";
import { collectFeeds } from "@/lib/insurance/collect";

export const runtime = "nodejs";
// 콜드 스타트 시 10여 개 소스를 처음 수집할 수 있어 여유를 둠
export const maxDuration = 60;

export async function GET() {
  const feed = await collectFeeds();
  return NextResponse.json(feed, {
    headers: {
      // 브라우저/엣지 60초 캐시 — 서버 캐시(15분)와 별개의 얇은 계층
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
