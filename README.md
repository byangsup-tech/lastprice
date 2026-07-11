# 🧒 우리동네 어린이집

내 위치(또는 지도에서 직접 지정한 위치) 기준으로 반경을 선택하면 근처 어린이집을 지도와 리스트로 보여주고, 최대 3곳을 나란히 비교할 수 있는 모바일 우선 웹앱입니다.

## 주요 기능

- **위치 지정**: 현재 위치(GPS) 버튼 또는 지도 탭/📍핀 드래그로 기준 위치 설정
- **반경 검색**: 500m / 1km / 2km / 3km 반경 내 어린이집 표시 (지도 마커 + 바텀시트 리스트)
- **의사결정 정보**: 유형(국공립/민간/가정 등), 정원/현원/**정원 여유**, 보육교직원 수와 교사 1인당 아동 수, 보육실 수·면적, 놀이터, CCTV, 통학차량, 인가일자, 거리, 전화
- **필터/정렬**: 유형 · 정원 여유 · 통학차량 · CCTV 필터, 거리순 · 정원 여유순 · 교사당 아동수 정렬
- **비교**: 2~3곳 선택 → 항목별 비교 테이블 (항목별 가장 좋은 값 초록색 하이라이트)

## 기술 스택

- Next.js (App Router, TypeScript) + Tailwind CSS — 모바일 우선 웹앱
- Leaflet + OpenStreetMap (react-leaflet) — API 키 불필요
- 데이터: [어린이집정보공개포털 보육정보공개 API](https://info.childcare.go.kr) (api.childcare.go.kr, 시군구 단위 조회)

## 실행 방법

```bash
npm install
npm run dev
# http://localhost:3000
```

API 키 없이 실행하면 **데모 모드**(강남/서초 일대 목업 데이터 84곳)로 동작하며, 상단에 안내 배너가 표시됩니다.

## 전국 실데이터 연동

1. [어린이집정보공개포털](https://info.childcare.go.kr)에서 보육정보공개 OPEN API 신청 후 인증키 발급
2. `.env.local` 파일 생성 (Vercel이면 Settings → Environment Variables):
   ```bash
   cp .env.local.example .env.local
   # CHILDCARE_API_KEY=발급받은_인증키
   ```
3. 서버 재시작 (Vercel이면 Redeploy)

이 API는 시군구 단위 조회만 지원하고 일 호출 한도(기본 1,000회)가 있어, **검색 위치 주변 시군구만 필요할 때 조회**하고 시군구별로 24시간 캐싱합니다(서버리스에서는 `/tmp`). 어떤 시군구가 조회됐는지는 `/api/daycares?...&debug=1`의 `meta` 필드로 확인할 수 있습니다. 호출 실패 시 만료된 캐시 → 데모 데이터 순으로 폴백합니다.

## 구조

```
src/
├── app/                # 메인(지도+리스트), /compare(비교), /api/daycares(반경 검색 API)
├── components/         # map(Leaflet), sheet(바텀시트/카드), controls(칩/정렬/GPS), detail, compare
├── lib/                # 오픈API 클라이언트, 캐시, haversine 반경 필터, 데모 데이터
└── hooks/              # useDaycares(디바운스 검색), useCompareSelection(비교 선택)
```

---

# 🛡️ 보험 상품개발 데스크 (`/insurance`)

보험회사 상품개발 실무자를 위한 정보 대시보드. 국내외 보험 뉴스·정책/공시·신상품·리서치를
RSS와 공개 API로 자동 수집해 하나의 피드로 보여줍니다. (어린이집 앱과 같은 레포에 공존하며,
`/insurance` 경로에서 동작)

## 2단계 — 신상품 신호 + 위험률 통계 패널 (현재)

- **배타적사용권 스크레이퍼**: 생보협회(klia.or.kr)·손보협회(knia.or.kr) 신청·심의결과
  게시판 → 신상품 카테고리로 유입. 범용 게시판 파서(앵커 패턴 + 날짜 추출) 기반
- **보험연구원 리포트 스크레이퍼**: kiri.or.kr 자료 게시판 → 리서치 카테고리
- **`/insurance/stats` 위험률 통계 패널**: KOSIS 연동(무료 키)
  - 기대수명 추이 라인 차트 (전체/남/여, 호버 크로스헤어 툴팁)
  - 사망원인 Top 10 가로 막대 (인구 10만 명당 사망률)
  - 스탯 타일: 기대수명·남녀 차이·사망원인 1위
  - 키 없으면 근사치 예시로 동작(배지 표시), 24시간 캐시

※ 스크레이퍼 URL·KOSIS 테이블 파라미터는 실환경 검증 전 — 배포 후 소스 상태
스트립과 `src/lib/insurance/scrapers.ts`, `src/lib/insurance/stats/kosis.ts` 주석 참고.

## 1단계 — 뉴스·공시 스트림

| 카테고리 | 소스 | 방식 |
|---|---|---|
| 국내 뉴스 | 네이버 뉴스 검색 API, 한국보험신문·보험신보·보험매일 RSS | API 키 / RSS |
| 해외 뉴스 | Insurance Journal, Reinsurance News, Artemis, Coverager, Insurance Business, Life Insurance International | RSS |
| 정책·공시 | 금융위원회(정책브리핑 RSS), DART 보험사 공시 | RSS / API 키 |
| 신상품 | 배타적사용권(생보/손보협회), 네이버 뉴스(신상품·배타적사용권), Google News 日本(保険 新商品)·中国(保险 新产品), Coverager Product | 스크레이핑 / API 키 / RSS |
| 리서치 | McKinsey Insights(보험 필터), 네이버 뉴스(보험연구원) | RSS / API 키 |

- 신상품 카테고리: 시장 필터(🇰🇷한국/🇨🇳중국/🇯🇵일본/🌐글로벌) + 상품 유형 자동 태그
  (암, 건강·의료, 간병·치매, 연금·저축, 펫 등 — 한·중·일·영 키워드 분류)
- 제목 자동 번역: DeepL API(`DEEPL_API_KEY`, 무료 월 50만 자)로 일본어·중국어 제목을
  한국어로 번역해 원문과 함께 표시. 아이템별 영구 캐시로 같은 제목은 한 번만 번역.
  대상 언어는 `TRANSLATE_LANGS`(기본 `ja,zh`, 영어 포함은 `ja,zh,en`)
- 소스별 15분 서버 캐시(메모리+`/tmp`), 실패 시 만료 캐시 → 예시 데이터 순 폴백
- 소스별 수집 상태(정상/지연/실패/키 미설정/예시)를 UI 상태 스트립에 표시
- API 키 없이도 예시 데이터로 UI 확인 가능 (상단 배너로 명시)

### 설정

```bash
cp .env.local.example .env.local
# NAVER_CLIENT_ID / NAVER_CLIENT_SECRET — developers.naver.com (무료 일 25,000회)
# DART_API_KEY — opendart.fss.or.kr (무료 일 20,000건)
npm run dev
# http://localhost:3000/insurance
```

주의: RSS 피드 URL 상당수는 개발망 이그레스 차단으로 실환경 검증 전입니다.
배포 후 소스 상태 스트립에서 수집 실패 소스를 확인하고 `src/lib/insurance/sources.ts`를 조정하세요.

### 2단계 예정

배타적사용권 게시판(생보·손보협회) 스크레이핑, 보험연구원/보험개발원 리포트,
위험률 통계 패널(KOSIS·HIRA·질병관리청), 경쟁사 실적공시(CSM/VNB) 패널

```
src/lib/insurance/     # sources(레지스트리), rss(파서), naver/dart(클라이언트), collect(수집), cache, demo-data
src/app/insurance/     # 대시보드 UI
src/app/api/insurance/ # GET /api/insurance/feed
```
