import type { CategoryKey, FeedItem } from "./types";

/**
 * 데모(예시) 데이터 — 소스 수집이 전부 실패했거나 API 키가 없을 때 UI 확인용.
 * 실제 기사가 아니며, 카드에 "예시" 배지와 상단 배너로 명시된다.
 */

interface DemoSeed {
  sourceName: string;
  title: string;
  summary?: string;
  url: string;
  lang: "ko" | "en";
  hoursAgo: number;
}

const SEEDS: Record<CategoryKey, DemoSeed[]> = {
  "kr-news": [
    {
      sourceName: "한국보험신문",
      title: "생보사 3분기 신계약 CSM 두 자릿수 성장…건강보험 상품이 견인",
      summary:
        "주요 생명보험사의 3분기 신계약 CSM이 전년 동기 대비 큰 폭으로 늘었다. 저해지환급형 건강보험과 제3보험 판매 확대가 주요 요인으로 꼽힌다.",
      url: "https://www.insnews.co.kr",
      lang: "ko",
      hoursAgo: 2,
    },
    {
      sourceName: "보험매일",
      title: "금감원, 실손의료보험 비급여 관리 강화 방안 발표",
      summary:
        "비급여 항목 코드 표준화와 청구 데이터 공유 확대가 핵심. 손해율 관리에 미치는 영향에 업계 관심이 집중된다.",
      url: "https://www.fins.co.kr",
      lang: "ko",
      hoursAgo: 5,
    },
    {
      sourceName: "네이버 뉴스 검색",
      title: "손보업계, 펫보험 가입률 3% 돌파…보장 범위 경쟁 본격화",
      summary:
        "반려동물 진료비 표준수가 논의와 맞물려 펫보험 시장이 빠르게 성장하고 있다.",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 9,
    },
    {
      sourceName: "보험신보",
      title: "IFRS17 3년차, 보험사 계리 인력 수요 여전히 '품귀'",
      url: "https://www.insweek.co.kr",
      lang: "ko",
      hoursAgo: 22,
    },
  ],
  "global-news": [
    {
      sourceName: "Insurance Journal",
      title: "US Life Insurers Expand Wellness-Linked Products as Wearable Data Matures",
      summary:
        "Carriers are increasingly tying premium discounts to verified activity data, with regulators watching accuracy and fairness concerns.",
      url: "https://www.insurancejournal.com",
      lang: "en",
      hoursAgo: 3,
    },
    {
      sourceName: "Reinsurance News",
      title: "Global Reinsurers Report Improved Life Margins on Mortality Normalization",
      url: "https://www.reinsurancene.ws",
      lang: "en",
      hoursAgo: 7,
    },
    {
      sourceName: "Coverager",
      title: "Parametric Startup Raises Series B to Scale Climate Coverage in Asia",
      summary:
        "The insurer plans typhoon and flood parametric products for SMEs across Southeast Asia.",
      url: "https://coverager.com",
      lang: "en",
      hoursAgo: 12,
    },
    {
      sourceName: "Artemis (ILS·캣본드)",
      title: "Catastrophe Bond Issuance on Record Pace as Spreads Tighten",
      url: "https://www.artemis.bm",
      lang: "en",
      hoursAgo: 26,
    },
  ],
  policy: [
    {
      sourceName: "금융위원회 (정책브리핑)",
      title: "보험업감독규정 일부개정규정안 규정변경예고 — 무·저해지 상품 해지율 가정 합리화",
      summary:
        "무·저해지환급형 상품의 해지율 가정 산출 기준을 정비하고 공시 의무를 확대하는 내용.",
      url: "https://www.fsc.go.kr",
      lang: "ko",
      hoursAgo: 6,
    },
    {
      sourceName: "DART 보험사 공시",
      title: "[삼성생명] 기업설명회(IR) 개최 — 2026년 2분기 경영실적",
      url: "https://dart.fss.or.kr",
      lang: "ko",
      hoursAgo: 10,
    },
    {
      sourceName: "금융위원회 (정책브리핑)",
      title: "실손보험 청구 전산화 2단계 시행…의원급 확대 일정 확정",
      url: "https://www.fsc.go.kr",
      lang: "ko",
      hoursAgo: 30,
    },
    {
      sourceName: "DART 보험사 공시",
      title: "[DB손해보험] 주요사항보고서 (자기주식 취득 결정)",
      url: "https://dart.fss.or.kr",
      lang: "ko",
      hoursAgo: 33,
    },
  ],
  "new-products": [
    {
      sourceName: "네이버 뉴스 — 배타적사용권",
      title: "생보협회, '재발암 집중보장 특약'에 배타적사용권 6개월 부여",
      summary:
        "암 치료 후 재발·전이 단계별 보장을 세분화한 신담보의 독창성을 인정받았다.",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 4,
    },
    {
      sourceName: "네이버 뉴스 — 신상품",
      title: "한화생명, 간병·치매 통합보장 신상품 출시…현금+실물급부 결합",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 8,
    },
    {
      sourceName: "Coverager — Product",
      title: "Japanese Insurer Launches Embedded Travel Cover with Super-App Partner",
      url: "https://coverager.com/category/product/",
      lang: "en",
      hoursAgo: 15,
    },
    {
      sourceName: "네이버 뉴스 — 신상품",
      title: "손보사, 1인 자영업자 휴업손실보험 잇따라 출시",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 28,
    },
  ],
  research: [
    {
      sourceName: "네이버 뉴스 — 보험연구원",
      title: "보험연구원 '초고령사회 간병리스크와 민영보험의 역할' 보고서 발간",
      summary:
        "장기요양 재정 전망과 민영 간병보험의 보완 역할을 분석하고 상품 설계 방향을 제언했다.",
      url: "https://www.kiri.or.kr",
      lang: "ko",
      hoursAgo: 11,
    },
    {
      sourceName: "McKinsey Insights",
      title: "Global Insurance Report: Growth Pockets in Health and Protection",
      summary:
        "Health and protection lines outpace savings products as demographic shifts reshape demand across Asia.",
      url: "https://www.mckinsey.com/industries/financial-services/our-insights/insurance",
      lang: "en",
      hoursAgo: 20,
    },
    {
      sourceName: "네이버 뉴스 — 보험연구원",
      title: "KIRI 리포트: 무·저해지 상품 해지율 경험통계의 시사점",
      url: "https://www.kiri.or.kr",
      lang: "ko",
      hoursAgo: 45,
    },
  ],
};

/** 호출 시점 기준의 상대 시각으로 데모 아이템을 생성 */
export function demoItems(category: CategoryKey): FeedItem[] {
  const now = Date.now();
  return SEEDS[category].map((seed, i) => ({
    id: `demo-${category}-${i}`,
    sourceId: `demo-${category}`,
    sourceName: seed.sourceName,
    category,
    title: seed.title,
    url: seed.url,
    summary: seed.summary,
    publishedAt: new Date(now - seed.hoursAgo * 60 * 60 * 1000).toISOString(),
    lang: seed.lang,
    demo: true,
  }));
}
