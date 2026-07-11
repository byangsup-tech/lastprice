import { fetchText } from "./http";
import { decodeEntities, stripTags, type ParsedFeedItem } from "./rss";

/**
 * 표준 게시판 목록 페이지 범용 스크레이퍼.
 * 앵커(href 패턴 매칭) → 제목, 주변 텍스트의 날짜를 추출한다.
 *
 * ※ 아래 URL·패턴은 조사 자료 기반이며 개발망 이그레스 차단으로 실환경 검증 전.
 *   수집 실패는 소스 상태 스트립에 error로 표시되므로, 배포 후 실제 목록 페이지
 *   HTML을 보고 hrefIncludes/url을 조정할 것.
 */

export interface BoardScraperConfig {
  /** 목록 페이지 URL */
  url: string;
  /** 이 중 하나가 href에 포함된 앵커만 게시글로 간주 */
  hrefIncludes: string[];
  /** 게시글 제목으로 보기 위한 최소 길이 (내비게이션 링크 배제) */
  minTitleLength?: number;
  /** 제목 앞에 붙일 말머리 */
  titlePrefix?: string;
}

export const SCRAPERS: Record<string, BoardScraperConfig> = {
  // 생명보험협회 배타적사용권 신청사항 및 심의결과
  "klia-exclusive": {
    url: "https://www.klia.or.kr/member/exclUse/exclResult/list.do",
    hrefIncludes: ["exclUse", "exclResult"],
    titlePrefix: "[생보 배타적사용권] ",
  },
  // 손해보험협회 배타적사용권 신청사항 및 심의결과
  "knia-exclusive": {
    url: "https://www.knia.or.kr/report/new-review/new-review02",
    hrefIncludes: ["new-review", "file/download"],
    titlePrefix: "[손보 배타적사용권] ",
  },
  // 보험연구원 연구보고서/리포트 (materialView.do 상세 링크 패턴)
  "kiri-reports": {
    url: "https://www.kiri.or.kr/community/materialList.do",
    hrefIncludes: ["materialView.do"],
    titlePrefix: "[보험연구원] ",
  },
};

const ANCHOR_RE = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const DATE_RE = /20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/;

function parseNearbyDate(html: string, anchorEnd: number): string | undefined {
  // 같은 행(<tr>/<li>)의 날짜는 보통 앵커 직후 수백 자 안에 있다
  const window = html.slice(anchorEnd, anchorEnd + 400);
  const m = window.match(DATE_RE);
  if (!m) return undefined;
  const normalized = m[0].replace(/[./]/g, "-").replace(/\s/g, "");
  const t = Date.parse(`${normalized}T09:00:00+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export async function scrapeBoard(
  config: BoardScraperConfig,
): Promise<ParsedFeedItem[]> {
  const html = await fetchText(config.url);
  const items: ParsedFeedItem[] = [];
  const seen = new Set<string>();
  const minLen = config.minTitleLength ?? 8;

  for (const m of html.matchAll(ANCHOR_RE)) {
    const [, href, inner] = m;
    if (!config.hrefIncludes.some((p) => href.includes(p))) continue;

    const title = decodeEntities(stripTags(inner));
    if (title.length < minLen) continue;

    let url: string;
    try {
      // href 속성 안의 &amp; 등 엔티티를 디코드한 뒤 절대 URL로 해석
      url = new URL(decodeEntities(href), config.url).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);

    items.push({
      title: `${config.titlePrefix ?? ""}${title}`,
      link: url,
      publishedAt: parseNearbyDate(html, (m.index ?? 0) + m[0].length),
    });
  }
  if (items.length === 0) {
    throw new Error("게시글 링크를 찾지 못함 — 목록 페이지 구조 확인 필요");
  }
  return items;
}
