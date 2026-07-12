import { productTags } from "./classify";
import type { CategoryKey, FeedItem, Lang, Market } from "./types";

/**
 * 데모(예시) 데이터 — 소스 수집이 전부 실패했거나 API 키가 없을 때 UI 확인용.
 * 실제 기사가 아니며, 카드에 "예시" 배지와 상단 배너로 명시된다.
 */

interface DemoSeed {
  sourceName: string;
  title: string;
  /** 수동 번역 (비한국어 시드) — 번역 기능 데모용 */
  titleKo?: string;
  summary?: string;
  url: string;
  lang: Lang;
  hoursAgo: number;
  market?: Market;
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
      sourceName: "금감원 분쟁조정례",
      title:
        "[분쟁조정례] 암보험 '직접치료' 해당 여부 — 요양병원 입원비 지급 조정 결정",
      summary:
        "말기암 환자의 요양병원 입원이 암의 직접치료에 해당하는지에 대한 조정례. 약관상 직접치료 정의 문구 설계에 참고.",
      url: "https://www.fss.or.kr",
      lang: "ko",
      hoursAgo: 18,
    },
    {
      sourceName: "국회 의안 — 보험",
      title: "[의안] 보험업법 일부개정법률안 (소비자 설명의무 강화) — ○○○의원 등 12인",
      url: "https://likms.assembly.go.kr",
      lang: "ko",
      hoursAgo: 26,
    },
    {
      sourceName: "DART 보험사 공시",
      title: "[DB손해보험] 주요사항보고서 (자기주식 취득 결정)",
      url: "https://dart.fss.or.kr",
      lang: "ko",
      hoursAgo: 33,
    },
    {
      sourceName: "금융위 규정변경예고",
      title: "[규정변경예고] 보험업감독규정 개정안 — 신지급여력제도(K-ICS) 경과조치 정비",
      url: "https://www.fsc.go.kr/po1002",
      lang: "ko",
      hoursAgo: 40,
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
      market: "KR",
    },
    {
      sourceName: "Google News (日本) — 保険 新商品",
      title:
        "日本生命、認知症・介護を一体保障する新商品「みらいのカタチ 認知症サポートプラス」を発売",
      titleKo:
        "일본생명, 치매·간병 통합보장 신상품 '미라이노카타치 치매서포트플러스' 출시",
      url: "https://news.google.com",
      lang: "ja",
      hoursAgo: 6,
      market: "JP",
    },
    {
      sourceName: "네이버 뉴스 — 신상품",
      title: "한화생명, 간병·치매 통합보장 신상품 출시…현금+실물급부 결합",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 8,
      market: "KR",
    },
    {
      sourceName: "Google News (中国) — 保险 新产品",
      title: "平安人寿发布重大疾病保险新产品，覆盖120种重疾并扩展轻症保障",
      titleKo: "핑안생명, 120종 중대질병·경증 보장 확대한 중대질병보험 신상품 발표",
      url: "https://news.google.com",
      lang: "zh",
      hoursAgo: 12,
      market: "CN",
    },
    {
      sourceName: "Coverager — Product",
      title:
        "Japanese Insurer Launches Embedded Travel Cover with Super-App Partner",
      url: "https://coverager.com/category/product/",
      lang: "en",
      hoursAgo: 15,
      market: "GLOBAL",
    },
    {
      sourceName: "Google News (日本) — 保険 新商品",
      title: "第一生命、健康増進型医療保険の新商品を10月から販売開始",
      titleKo: "다이이치생명, 건강증진형 의료보험 신상품 10월부터 판매 개시",
      url: "https://news.google.com",
      lang: "ja",
      hoursAgo: 21,
      market: "JP",
    },
    {
      sourceName: "Google News (中国) — 保险 新产品",
      title: "中国人寿推出专属商业养老保险新产品，支持灵活缴费",
      titleKo: "중국인수, 유연 납입을 지원하는 전속 상업양로보험 신상품 출시",
      url: "https://news.google.com",
      lang: "zh",
      hoursAgo: 26,
      market: "CN",
    },
    {
      sourceName: "네이버 뉴스 — 신상품",
      title: "손보사, 1인 자영업자 휴업손실보험 잇따라 출시",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 28,
      market: "KR",
    },
  ],
  "risk-research": [
    {
      sourceName: "보건복지부 — 급여·수가",
      title: "건정심, 초음파 검사 급여 확대 및 2027년 수가 인상률 의결",
      summary:
        "건강보험정책심의위원회가 상복부 초음파 급여 기준 확대와 유형별 환산지수를 의결했다. 실손 손해율과 급여·비급여 구성에 직접 영향.",
      url: "https://www.mohw.go.kr",
      lang: "ko",
      hoursAgo: 3,
    },
    {
      sourceName: "네이버 뉴스 — 신의료기술",
      title: "AI 기반 심전도 심부전 조기진단, 신의료기술평가 통과…비급여 진입",
      summary:
        "한국보건의료연구원 신의료기술평가를 통과해 의료 현장 사용이 가능해졌다. 진단 급여화 전 단계의 비급여 항목 등장.",
      url: "https://news.naver.com",
      lang: "ko",
      hoursAgo: 7,
    },
    {
      sourceName: "KCI 논문 — 위험률",
      title: "[논문] 국민건강보험 표본코호트를 이용한 당뇨 유병자 사망률 연구 — 계리학연구",
      url: "https://www.kci.go.kr",
      lang: "ko",
      hoursAgo: 14,
    },
    {
      sourceName: "통계청 공표",
      title: "2025년 사망원인통계 결과 공표 — 암 사망률 소폭 하락, 치매 사망률 상승 지속",
      url: "https://kostat.go.kr",
      lang: "ko",
      hoursAgo: 20,
    },
    {
      sourceName: "PubMed — 한국 역학",
      title:
        "[PubMed] Trends in cancer incidence and survival in Korea, 2000-2023 — Cancer Research and Treatment",
      url: "https://pubmed.ncbi.nlm.nih.gov",
      lang: "en",
      hoursAgo: 27,
    },
    {
      sourceName: "WHO 발표",
      title: "World Health Statistics 2026: global life expectancy recovers to pre-pandemic level",
      url: "https://www.who.int",
      lang: "en",
      hoursAgo: 33,
    },
    {
      sourceName: "질병관리청 공표",
      title: "2025 국민건강영양조사 결과 발표 — 30대 남성 비만 유병률 최고치",
      url: "https://www.kdca.go.kr",
      lang: "ko",
      hoursAgo: 41,
    },
    {
      sourceName: "arXiv — 사망률 모형·장수리스크",
      title: "A Neural Lee-Carter Extension for Cause-of-Death Mortality Forecasting",
      url: "https://arxiv.org",
      lang: "en",
      hoursAgo: 47,
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
    titleKo: seed.titleKo,
    url: seed.url,
    summary: seed.summary,
    publishedAt: new Date(now - seed.hoursAgo * 60 * 60 * 1000).toISOString(),
    lang: seed.lang,
    market: seed.market,
    tags:
      category === "new-products"
        ? productTags(`${seed.title} ${seed.summary ?? ""}`)
        : undefined,
    demo: true,
  }));
}
