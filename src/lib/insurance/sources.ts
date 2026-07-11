import type { SourceDef } from "./types";

/**
 * 1단계 소스 레지스트리 — RSS/공개 API만으로 수집 가능한 것.
 * 스크레이핑이 필요한 소스(배타적사용권 게시판, 보험연구원 등)는 2단계에서 추가.
 *
 * 주의: 피드 URL 상당수는 조사 시점에 실환경 검증을 못 했다(개발망 이그레스 차단).
 * 수집 실패는 소스별 status로 드러나므로 배포 후 상태 스트립에서 확인할 것.
 */
export const SOURCES: SourceDef[] = [
  // ── 국내 뉴스 ───────────────────────────────────────────────
  {
    id: "naver-insurance",
    name: "네이버 뉴스 검색",
    category: "kr-news",
    kind: "naver-news",
    lang: "ko",
    query: "보험",
    homepage: "https://news.naver.com",
    limit: 30,
  },
  {
    id: "insnews",
    name: "한국보험신문",
    category: "kr-news",
    kind: "rss",
    lang: "ko",
    url: "https://www.insnews.co.kr/rss/allArticle.xml",
    homepage: "https://www.insnews.co.kr",
  },
  {
    id: "insweek",
    name: "보험신보",
    category: "kr-news",
    kind: "rss",
    lang: "ko",
    url: "https://www.insweek.co.kr/rss/allArticle.xml",
    homepage: "https://www.insweek.co.kr",
  },
  {
    id: "fins",
    name: "보험매일",
    category: "kr-news",
    kind: "rss",
    lang: "ko",
    url: "https://www.fins.co.kr/rss/allArticle.xml",
    homepage: "https://www.fins.co.kr",
  },

  // ── 해외 뉴스 ───────────────────────────────────────────────
  {
    id: "insurance-journal",
    name: "Insurance Journal",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://www.insurancejournal.com/feed/",
    homepage: "https://www.insurancejournal.com",
  },
  {
    id: "reinsurance-news",
    name: "Reinsurance News",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://www.reinsurancene.ws/feed/",
    homepage: "https://www.reinsurancene.ws",
  },
  {
    id: "artemis",
    name: "Artemis (ILS·캣본드)",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://www.artemis.bm/news/feed/",
    homepage: "https://www.artemis.bm",
  },
  {
    id: "coverager",
    name: "Coverager",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://coverager.com/feed/",
    homepage: "https://coverager.com",
  },
  {
    id: "ib-us",
    name: "Insurance Business (US)",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://www.insurancebusinessmag.com/us/rss/",
    homepage: "https://www.insurancebusinessmag.com/us/",
  },
  {
    id: "life-insurance-intl",
    name: "Life Insurance International",
    category: "global-news",
    kind: "rss",
    lang: "en",
    url: "https://www.lifeinsuranceinternational.com/feed/",
    homepage: "https://www.lifeinsuranceinternational.com",
  },

  // ── 정책·공시 ───────────────────────────────────────────────
  {
    id: "korea-kr-fsc",
    name: "금융위원회 (정책브리핑)",
    category: "policy",
    kind: "rss",
    lang: "ko",
    url: "https://www.korea.kr/rss/dept_fsc.xml",
    homepage: "https://www.fsc.go.kr",
    // 금융위 전체 보도자료 중 보험 관련만
    include: ["보험", "실손", "연금", "IFRS", "지급여력", "K-ICS"],
    limit: 30,
  },
  {
    id: "dart-insurers",
    name: "DART 보험사 공시",
    category: "policy",
    kind: "dart",
    lang: "ko",
    homepage: "https://dart.fss.or.kr",
    limit: 30,
  },

  // ── 신상품 ─────────────────────────────────────────────────
  {
    id: "coverager-product",
    name: "Coverager — Product",
    category: "new-products",
    kind: "rss",
    lang: "en",
    url: "https://coverager.com/category/product/feed/",
    homepage: "https://coverager.com/category/product/",
  },
  {
    id: "naver-new-products",
    name: "네이버 뉴스 — 신상품",
    category: "new-products",
    kind: "naver-news",
    lang: "ko",
    query: "보험 신상품 출시",
    homepage: "https://news.naver.com",
  },
  {
    id: "naver-exclusive-right",
    name: "네이버 뉴스 — 배타적사용권",
    category: "new-products",
    kind: "naver-news",
    lang: "ko",
    query: "배타적사용권",
    homepage: "https://news.naver.com",
  },

  // ── 리서치 ─────────────────────────────────────────────────
  {
    id: "mckinsey",
    name: "McKinsey Insights",
    category: "research",
    kind: "rss",
    lang: "en",
    url: "https://www.mckinsey.com/insights/rss",
    homepage:
      "https://www.mckinsey.com/industries/financial-services/our-insights/insurance",
    // 전사 피드 → 보험 관련 항목만
    include: ["insurance", "insurer", "insurtech", "reinsurance", "actuar"],
    limit: 15,
  },
  {
    id: "naver-kiri",
    name: "네이버 뉴스 — 보험연구원",
    category: "research",
    kind: "naver-news",
    lang: "ko",
    query: "보험연구원",
    homepage: "https://www.kiri.or.kr",
  },
];

export function sourcesByCategory(category: string): SourceDef[] {
  return SOURCES.filter((s) => s.category === category);
}
