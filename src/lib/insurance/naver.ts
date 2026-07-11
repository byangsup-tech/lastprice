import { fetchJson } from "./http";
import type { ParsedFeedItem } from "./rss";

/**
 * 네이버 뉴스 검색 Open API.
 * https://developers.naver.com/docs/serviceapi/search/news/news.md
 * 무료 일 25,000회 — 개발자센터에서 앱 등록 후 Client ID/Secret 발급.
 */

interface NaverNewsResponse {
  items: {
    title: string;
    originallink: string;
    link: string;
    description: string;
    pubDate: string;
  }[];
}

export function hasNaverKeys(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

function stripBold(text: string): string {
  return text
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'");
}

export async function searchNaverNews(
  query: string,
  display = 20,
): Promise<ParsedFeedItem[]> {
  const url =
    "https://openapi.naver.com/v1/search/news.json" +
    `?query=${encodeURIComponent(query)}&display=${display}&start=1&sort=date`;
  const data = await fetchJson<NaverNewsResponse>(url, {
    headers: {
      "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!,
      "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!,
    },
  });
  return (data.items ?? []).map((it) => {
    const t = Date.parse(it.pubDate);
    return {
      title: stripBold(it.title),
      link: it.originallink || it.link,
      summary: stripBold(it.description),
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    };
  });
}
