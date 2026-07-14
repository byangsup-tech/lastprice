import { NextRequest, NextResponse } from "next/server";
import { getCached } from "@/lib/insurance/cache";
import {
  fetchSearchTrends,
  hasNaverKeys,
  recentChangePct,
  syntheticTrend,
} from "@/lib/insurance/stats/datalab";
import type {
  KeywordTrend,
  KeywordTrendsResponse,
} from "@/lib/insurance/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** 검색어 트렌드는 월 단위 — 하루 캐시 */
const TTL_MS = 24 * 60 * 60 * 1000;

function lastMonths(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function demoTrends(keywords: string[]): KeywordTrend[] {
  const months = lastMonths(12);
  return keywords.map((keyword) => {
    const values = syntheticTrend(keyword, months.length);
    return { keyword, months, values, changePct: recentChangePct(values) };
  });
}

export async function GET(req: NextRequest) {
  const keywords = [
    ...new Set(
      (req.nextUrl.searchParams.get("keywords") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 5); // 데이터랩 그룹 상한
  if (keywords.length === 0) {
    return NextResponse.json({ error: "keywords 필요" }, { status: 400 });
  }

  let body: KeywordTrendsResponse;
  if (!hasNaverKeys()) {
    body = { status: "demo", trends: demoTrends(keywords) };
  } else {
    try {
      const key = `kw-trends:${[...keywords].sort().join(",")}`;
      const { data, status } = await getCached(
        key,
        () => fetchSearchTrends(keywords),
        TTL_MS,
      );
      body = {
        status,
        trends: data.series.map((s) => ({
          keyword: s.name,
          months: data.months,
          values: s.values,
          changePct: recentChangePct(s.values),
        })),
      };
    } catch {
      body = { status: "demo", trends: demoTrends(keywords) };
    }
  }

  return NextResponse.json(body, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
