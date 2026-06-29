import { NextRequest, NextResponse } from "next/server";
import { LISTED_TICKERS } from "@/lib/quantum-data";
import { getQuotes } from "@/lib/quantum-quotes";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/quantum/quotes[?tickers=IONQ,RGTI]
 * 순수 양자 상장사 시세/밸류에이션. 라이브 실패 시 스냅샷 폴백.
 */
export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("tickers");
  const requested = param
    ? param
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : LISTED_TICKERS;
  // 허용된 티커만 (임의 외부 심볼 조회 방지)
  const tickers = requested.filter((t) => LISTED_TICKERS.includes(t));
  if (tickers.length === 0) {
    return NextResponse.json({ error: "유효한 티커가 없습니다" }, { status: 400 });
  }

  const result = await getQuotes(tickers);
  return NextResponse.json(result);
}
