import { NextRequest, NextResponse } from "next/server";
import { LISTED_TICKERS } from "@/lib/quantum-data";
import { getHistory } from "@/lib/quantum-quotes";

export const runtime = "nodejs";
export const maxDuration = 30;

const RANGES = ["1y", "5y"] as const;

/**
 * GET /api/quantum/history?ticker=IONQ&range=1y
 * 단일 종목 주가 시계열(주봉). 라이브 실패 시 합성 스냅샷 폴백.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ticker = (sp.get("ticker") ?? "").trim();
  const rangeParam = sp.get("range") ?? "1y";
  const range = (RANGES as readonly string[]).includes(rangeParam)
    ? rangeParam
    : "1y";

  if (!LISTED_TICKERS.includes(ticker)) {
    return NextResponse.json(
      { error: "유효한 티커가 필요합니다" },
      { status: 400 },
    );
  }

  const result = await getHistory(ticker, range);
  return NextResponse.json(result);
}
