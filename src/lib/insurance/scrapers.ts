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
  /** 이 중 하나라도 href에 포함되면 배제 (허브/내비 링크) */
  hrefExcludes?: string[];
  /** 게시글 제목으로 보기 위한 최소 길이 (내비게이션 링크 배제) */
  minTitleLength?: number;
  /** 제목 앞에 붙일 말머리 */
  titlePrefix?: string;
  /**
   * 직접 fetch 실패/0건 시 Jina Reader(r.jina.ai) 경유 재시도.
   * JS 렌더링·봇 차단 사이트(BCG 등)용 — 무료·키 불필요, 마크다운 반환.
   */
  readerFallback?: boolean;
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
  // 금융감독원 분쟁조정례 — 약관 문구·부담보 설계의 필수 참고 (eGovFrame 표준 게시판)
  "fss-dispute": {
    url: "https://www.fss.or.kr/fss/bbs/B0000203/list.do?menuNo=200686",
    hrefIncludes: ["view.do"],
    titlePrefix: "[분쟁조정례] ",
  },
  // 금융위원회 규정변경예고 — 감독규정 개정의 선행 신호
  "fsc-rule-notice": {
    url: "https://www.fsc.go.kr/po1002",
    hrefIncludes: ["po1002/"],
    titlePrefix: "[규정변경예고] ",
  },
  // ── 컨설팅펌 보험 인사이트 (JS 렌더링·봇 차단 가능 → readerFallback) ──
  "bcg-insurance": {
    url: "https://www.bcg.com/industries/insurance/overview",
    hrefIncludes: ["/publications/"],
    titlePrefix: "[BCG] ",
    minTitleLength: 12,
    readerFallback: true,
  },
  "bain-insurance": {
    url: "https://www.bain.com/insights/industry-insights/insurance-insights/",
    hrefIncludes: ["/insights/"],
    hrefExcludes: ["industry-insights", "/insights/topics"],
    titlePrefix: "[Bain] ",
    minTitleLength: 12,
    readerFallback: true,
  },
  "deloitte-insurance": {
    url: "https://www.deloitte.com/us/en/insights/industry/insurance.html",
    hrefIncludes: ["/insights/industry/"],
    hrefExcludes: ["insurance.html"],
    titlePrefix: "[Deloitte] ",
    minTitleLength: 12,
    readerFallback: true,
  },
};

const ANCHOR_RE = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
/** Jina Reader가 반환하는 마크다운의 [제목](절대URL) 링크 */
const MD_LINK_RE = /\[([^\][\n]{4,120})\]\((https?:\/\/[^\s)]+)\)/g;
const DATE_RE = /20\d{2}[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/;
/** 영문 목록 날짜 (예: "July 2, 2026", "Jul 2 2026") */
const EN_DATE_RE =
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}/;

function parseNearbyDate(html: string, anchorEnd: number): string | undefined {
  // 같은 행(<tr>/<li>)의 날짜는 보통 앵커 직후 수백 자 안에 있다
  const window = html.slice(anchorEnd, anchorEnd + 400);
  const m = window.match(DATE_RE);
  if (m) {
    const normalized = m[0].replace(/[./]/g, "-").replace(/\s/g, "");
    const t = Date.parse(`${normalized}T09:00:00+09:00`);
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  const en = window.match(EN_DATE_RE);
  if (en) {
    const t = Date.parse(en[0]);
    return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
  }
  return undefined;
}

export async function scrapeBoard(
  config: BoardScraperConfig,
): Promise<ParsedFeedItem[]> {
  try {
    return parseBoard(config, await fetchText(config.url));
  } catch (err) {
    if (!config.readerFallback) throw err;
    // 직접 fetch 실패 또는 0건 — 렌더링 프록시(Jina Reader) 경유 재시도
    const rendered = await fetchText(`https://r.jina.ai/${config.url}`, {}, 25000);
    return parseBoard(config, rendered);
  }
}

/**
 * 목록 페이지 → 게시글 목록 (순수 함수 — 픽스처 테스트 대상).
 * HTML 앵커와 마크다운 링크(Reader 응답)를 모두 추출한다.
 */
export function parseBoard(
  config: BoardScraperConfig,
  content: string,
): ParsedFeedItem[] {
  const items: ParsedFeedItem[] = [];
  const seen = new Set<string>();
  const minLen = config.minTitleLength ?? 8;

  const push = (
    rawHref: string,
    rawTitle: string,
    nearbyDate?: string,
  ): void => {
    if (!config.hrefIncludes.some((p) => rawHref.includes(p))) return;
    if (config.hrefExcludes?.some((p) => rawHref.includes(p))) return;

    const title = decodeEntities(stripTags(rawTitle));
    if (title.length < minLen) return;

    let url: string;
    try {
      // href 속성 안의 &amp; 등 엔티티를 디코드한 뒤 절대 URL로 해석
      url = new URL(decodeEntities(rawHref), config.url).toString();
    } catch {
      return;
    }
    if (seen.has(url)) return;
    seen.add(url);

    items.push({
      title: `${config.titlePrefix ?? ""}${title}`,
      link: url,
      publishedAt: nearbyDate,
    });
  };

  for (const m of content.matchAll(ANCHOR_RE)) {
    push(m[1], m[2], parseNearbyDate(content, (m.index ?? 0) + m[0].length));
  }
  for (const m of content.matchAll(MD_LINK_RE)) {
    // 마크다운 이미지 링크 ![alt](...)는 제외
    if (content[(m.index ?? 1) - 1] === "!") continue;
    push(m[2], m[1], parseNearbyDate(content, (m.index ?? 0) + m[0].length));
  }

  if (items.length === 0) {
    throw new Error("게시글 링크를 찾지 못함 — 목록 페이지 구조 확인 필요");
  }
  return items;
}
