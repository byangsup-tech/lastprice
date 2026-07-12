import { fetchText } from "./http";
import { decodeEntities, stripTags, type ParsedFeedItem } from "./rss";

/**
 * KCI(한국학술지인용색인) Open API — 논문 검색.
 * https://www.kci.go.kr (무료 키, 포털 로그인 후 신청)
 *
 * 위험률·사망률·발생률 키워드로 신규 논문을 추적한다
 * (보험학회지·계리학연구·리스크관리연구·보험금융연구 등이 걸림).
 * 응답은 XML — 필드 태그명은 조사 기반 추정이라 방어적으로 파싱하고,
 * 레코드가 0건이면 예외 → 상태 스트립에 표시. 배포 후 실응답 보고 조정.
 */

const BASE = "https://open.kci.go.kr/po/openapi/openApiSearch.kci";

export function hasKciKey(): boolean {
  return !!process.env.KCI_API_KEY;
}

function tagContent(block: string, tag: string): string | undefined {
  const m = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"),
  );
  return m ? decodeEntities(stripTags(m[1])) : undefined;
}

/** XML → 논문 목록 (순수 함수 — 픽스처 테스트 대상) */
export function parseKciXml(xml: string): ParsedFeedItem[] {
  const records = xml.match(/<record[\s\S]*?<\/record>/gi) ?? [];
  const items: ParsedFeedItem[] = [];
  for (const block of records) {
    const title = tagContent(block, "article-title");
    if (!title) continue;
    const journal = tagContent(block, "journal-name");
    const year = tagContent(block, "pub-year");
    const articleId = block.match(/article-id[^>]*>([^<]+)</i)?.[1]?.trim();
    const url =
      tagContent(block, "url") ??
      (articleId
        ? `https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=${articleId}`
        : `https://www.kci.go.kr`);
    // 발행 연도만 제공 — 연 중간(7/1)으로 두어 지나친 최신/과거 표시를 피한다
    const t = year ? Date.parse(`${year}-07-01T09:00:00+09:00`) : NaN;
    items.push({
      title: `[논문] ${title}${journal ? ` — ${journal}` : ""}`,
      link: url,
      publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
    });
  }
  if (items.length === 0) {
    throw new Error("KCI 응답 파싱 실패 — apiCode/파라미터 확인 필요");
  }
  return items;
}

export async function fetchKciArticles(
  query: string,
  displayCount = 15,
): Promise<ParsedFeedItem[]> {
  const url =
    `${BASE}?apiCode=articleSearch&key=${process.env.KCI_API_KEY}` +
    `&title=${encodeURIComponent(query)}&displayCount=${displayCount}`;
  return parseKciXml(await fetchText(url, {}, 12000));
}
