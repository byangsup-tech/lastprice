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
- 데이터: [한국사회보장정보원 전국 어린이집 정보 조회](https://www.data.go.kr/data/15101155/openapi.do) (data.go.kr 오픈 API)

## 실행 방법

```bash
npm install
npm run dev
# http://localhost:3000
```

API 키 없이 실행하면 **데모 모드**(강남/서초 일대 목업 데이터 84곳)로 동작하며, 상단에 안내 배너가 표시됩니다.

## 전국 실데이터 연동

1. [공공데이터포털](https://www.data.go.kr/data/15101155/openapi.do)에서 "활용신청" 후 인증키 발급
2. `.env.local` 파일 생성:
   ```bash
   cp .env.local.example .env.local
   # DATA_GO_KR_API_KEY=발급받은_인증키
   ```
3. 서버 재시작

첫 요청 시 전국 약 3만 개 어린이집 데이터를 페이징 수집해 `.cache/daycares.json`에 저장합니다(30초~1분 소요). 이후 요청은 캐시를 사용하며 24시간마다 자동 갱신됩니다. API 장애 시 이전 캐시 → 데모 데이터 순으로 폴백합니다.

## 구조

```
src/
├── app/                # 메인(지도+리스트), /compare(비교), /api/daycares(반경 검색 API)
├── components/         # map(Leaflet), sheet(바텀시트/카드), controls(칩/정렬/GPS), detail, compare
├── lib/                # 오픈API 클라이언트, 캐시, haversine 반경 필터, 데모 데이터
└── hooks/              # useDaycares(디바운스 검색), useCompareSelection(비교 선택)
```
